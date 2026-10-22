import { DAY_MS, HOUR_MS, dragRateKmPerDay, isLeo, nodeDifferenceDeg, nodeRateDegPerDay, planeAngleDeg, semiMajorAxisKm, wrapDegrees, type ElementSet } from "./elements.ts";
import { ExclusionRules, type Body, type Exclusion, type Exclusions } from "./exclusions.ts";
import { distanceKm } from "./propagation.ts";

/**
 * The rendezvous detector: a state machine over pairs of objects, run set
 * by set as the catalogue publishes them. An object that moved (its plane
 * or its height changed since its last set) or that is new is searched
 * for every object whose plane it now shares, and each such pair is
 * watched from then on. Every new set of a watched object reads its pairs
 * for the stages, in the order a rendezvous takes them:
 *
 * - `plane`: the planes within `planeDeg` of each other (or, measured
 *   beside it and not watched, the nodes within `nodeDeg` with the
 *   inclinations within `nodeInclinationDeg`, the form the shadowing cases
 *   take), raised when the pair is first seen so, with how it came about,
 *   by launch or by manoeuvre.
 * - `height`: the semi-major axes within `heightKm`, raised once.
 * - `beside`: the chaser within `besideKm` of the target at the set's
 *   epoch and still within it `holdHours` later with no further manoeuvre,
 *   by SGP4; raised at the first set that shows it and confirmed by the
 *   next set, `confirmHours` or more later, that still shows it, or
 *   withdrawn where the next set has them far apart again (a bad fit).
 * - `left`: after a hold, the pair beyond `leftKm` at the epoch and the
 *   hold's length later, or the heights more than `heightKm` apart; raised
 *   and confirmed, or withdrawn, the same way.
 *
 * A pair of one launch or one owner is counted at the plane stage and not
 * watched, since constellations would make millions of them; a station's
 * visitors, a dispersing stack, a fragment and a duplicate number are watched and
 * every verdict on them carries the tag. The thresholds are the brief's
 * and the replay's (`docs/replay/README.md`), not fitted. The detector
 * reads only what the caller hands it: sets, the catalogue's rows and the
 * exclusions; it never fetches, stores or reads the environment.
 */

export const DETECTOR_NAME = "beside-v1";

export interface DetectorParameters {
  /** The plane stage: the angle between the orbital planes, in degrees. */
  planeDeg: number;
  /** The node-only match, measured beside the plane stage: the nodes within this, in degrees, and the inclinations within `nodeInclinationDeg`. */
  nodeDeg: number;
  nodeInclinationDeg: number;
  /** The height stage: the semi-major axes within this, in kilometres. */
  heightKm: number;
  /** The beside stage: the distance within this, in kilometres, now and `holdHours` later. */
  besideKm: number;
  holdHours: number;
  /** A beside or left verdict is confirmed by a set this much later that agrees. */
  confirmHours: number;
  /** The left stage: the distance beyond this, in kilometres. */
  leftKm: number;
  /** A set older than this is not read against another. */
  freshDays: number;
  /** Changes between an object's consecutive sets that count as a move. */
  stepInclinationDeg: number;
  stepNodeDeg: number;
  stepHeightKm: number;
  /** An object first seen within this many days of its launch is new; one first seen later is an old object seen again. */
  newDays: number;
  /** An object first seen with no catalogue row is new only once the detector has run this long, since at its start every object is first seen. */
  warmDays: number;
  /** A watched pair that never reached the height stage is dropped after this long, and one out of plane for `outOfPlaneDays`. */
  watchDays: number;
  outOfPlaneDays: number;
}

/** The brief's thresholds, as the replay of step 2 ran them (`docs/replay/README.md`). None is fitted. */
export const DETECTOR_PARAMETERS: DetectorParameters = {
  planeDeg: 0.1,
  nodeDeg: 0.1,
  nodeInclinationDeg: 1,
  heightKm: 5,
  besideKm: 100,
  holdHours: 24,
  confirmHours: 1,
  leftKm: 200,
  freshDays: 15,
  stepInclinationDeg: 0.01,
  stepNodeDeg: 0.05,
  stepHeightKm: 0.5,
  newDays: 60,
  warmDays: 10,
  watchDays: 120,
  outOfPlaneDays: 10,
};

export const STAGES = ["plane", "height", "beside", "left"] as const;
export type Stage = (typeof STAGES)[number];
export const VERDICT_STATES = ["raised", "confirmed", "withdrawn"] as const;
export type VerdictState = (typeof VERDICT_STATES)[number];

/** The geometry a verdict rests on, read at the set's epoch. */
export interface Evidence {
  /** The angle between the planes, the difference of the nodes and of the inclinations, in degrees. */
  thetaDeg: number;
  nodeDeg: number;
  inclinationDeg: number;
  /** The chaser's semi-major axis less the target's, in kilometres, and the eccentricities' difference. */
  deltaAKm: number;
  deltaE: number;
  /** The distance at the epoch and `holdHours` later with no further manoeuvre, in kilometres; null where SGP4 fails or the pair is far out of plane. */
  distanceKm: number | null;
  distanceLaterKm: number | null;
  /** The least distance read on the pair so far. */
  nearestKm: number | null;
}

export interface Verdict {
  stage: Stage;
  state: VerdictState;
  chaser: number;
  target: number;
  /** The epoch of the set judged, in milliseconds since 1970. */
  at: number;
  /** When the catalogue published that set; null where not known. */
  publishedAt: number | null;
  /** On a plane verdict: how the plane came to match, and by which test. */
  how?: "launch" | "manoeuvre";
  match?: "plane" | "node";
  exclusion: Exclusion | null;
  evidence: Evidence;
}

export interface ObjectState {
  latest: ElementSet;
  previous: ElementSet | null;
  /** When the detector first saw it; null where it was there at the start. */
  firstSeenMs: number | null;
}

export interface PairState {
  chaser: number;
  target: number;
  createdMs: number;
  exclusion: Exclusion | null;
  lastTheta: number;
  outOfPlaneSinceMs: number | null;
  lastEvalMs: number;
  height: boolean;
  heightOffCount: number;
  beside: "none" | "raised" | "confirmed" | "leaving";
  besideRaisedAt: number | null;
  besideConfirmedAt: number | null;
  leftRaisedAt: number | null;
  lastDistanceKm: number | null;
  nearestKm: number | null;
  /** When each stage was first raised, for the published timeline. */
  planeAt: number | null;
  heightAt: number | null;
}

export interface DetectorStates {
  objects: Map<number, ObjectState>;
  pairs: Map<string, PairState>;
  /** The epoch of the first set the detector read, from which its warm-up is counted. */
  startedMs: number | null;
}

export const newStates = (): DetectorStates => ({ objects: new Map(), pairs: new Map(), startedMs: null });

export interface DetectorInput {
  /** The sets published since the last run, in the order the catalogue published them. */
  sets: ElementSet[];
  /** The catalogue's row for an object, or undefined where it has none. */
  body: (number: number) => Body | undefined;
  exclusions: Exclusions;
}

export interface DetectorOutput {
  verdicts: Verdict[];
  /** Pairs counted at the plane stage and not watched, by exclusion. */
  counted: Record<Exclusion, number>;
  states: DetectorStates;
}

export const pairKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** One run of the detector over the sets given, carrying the states from the last run. */
export function runDetector(input: DetectorInput, states: DetectorStates = newStates(), params: DetectorParameters = DETECTOR_PARAMETERS): DetectorOutput {
  const rules = new ExclusionRules(input.exclusions);
  const verdicts: Verdict[] = [];
  const counted: Record<Exclusion, number> = { "same launch": 0, "same owner": 0, "station visitor": 0, "dispersing stack": 0, fragment: 0, duplicate: 0 };
  const { objects, pairs } = states;
  const seen = (n: number) => { const s = objects.get(n)!; return { body: input.body(n), designator: s.latest.designator, firstSeenMs: s.firstSeenMs }; };
  // The fresh objects by inclination bucket, for the plane search; built once per run, at the first move, and kept up with the objects seen after it.
  const cache: { buckets: Map<number, number[]> | null } = { buckets: null };
  const bucketsAt = (tMs: number): Map<number, number[]> => {
    if (cache.buckets !== null) return cache.buckets;
    const buckets = new Map<number, number[]>();
    for (const [n, s] of objects) {
      if (tMs - s.latest.epochMs > params.freshDays * DAY_MS) continue;
      const b = Math.floor(s.latest.inclinationDeg / params.planeDeg);
      let list = buckets.get(b);
      if (list === undefined) buckets.set(b, (list = []));
      list.push(n);
    }
    cache.buckets = buckets;
    return buckets;
  };

  for (const set of input.sets) {
    if (!isLeo(set)) continue;
    if (states.startedMs === null) states.startedMs = set.epochMs;
    const state = objects.get(set.number);
    let moved = false;
    let how: "launch" | "manoeuvre" = "manoeuvre";
    if (state === undefined) {
      const warm = set.epochMs - states.startedMs < params.warmDays * DAY_MS;
      objects.set(set.number, { latest: set, previous: null, firstSeenMs: warm ? null : set.epochMs });
      if (cache.buckets !== null) { const b = Math.floor(set.inclinationDeg / params.planeDeg); cache.buckets.set(b, [...(cache.buckets.get(b) ?? []), set.number]); }
      const body = input.body(set.number);
      const launchedRecently = body?.launchedOn != null && set.epochMs - Date.parse(`${body.launchedOn}T00:00:00Z`) < params.newDays * DAY_MS;
      if (!warm && (body === undefined || launchedRecently)) { moved = true; how = "launch"; }
    } else {
      if (set.epochMs <= state.latest.epochMs) continue;
      const prev = state.latest;
      state.previous = prev;
      state.latest = set;
      const dt = (set.epochMs - prev.epochMs) / DAY_MS;
      if (dt <= params.freshDays) {
        const planeChange = Math.abs(set.inclinationDeg - prev.inclinationDeg) > params.stepInclinationDeg || Math.abs(wrapDegrees(set.raanDeg - prev.raanDeg - nodeRateDegPerDay(prev) * dt)) > params.stepNodeDeg;
        const heightChange = Math.abs(semiMajorAxisKm(set.meanMotion) - semiMajorAxisKm(prev.meanMotion) - dragRateKmPerDay(prev) * dt) > params.stepHeightKm;
        moved = planeChange || heightChange;
      }
    }
    const t = set.epochMs;
    const body = input.body(set.number);
    if (moved && (body === undefined || body.kind === "payload")) {
      const b = Math.floor(set.inclinationDeg / params.planeDeg);
      const all = bucketsAt(t);
      const lo = b - Math.ceil(params.nodeInclinationDeg / params.planeDeg);
      const hi = b + Math.ceil(params.nodeInclinationDeg / params.planeDeg);
      for (let bucket = lo; bucket <= hi; bucket++) {
        for (const target of all.get(bucket) ?? []) {
          if (target === set.number) continue;
          const ts = objects.get(target)!;
          if (t - ts.latest.epochMs > params.freshDays * DAY_MS) continue;
          const theta = planeAngleDeg(set, ts.latest, t);
          const node = nodeDifferenceDeg(set, ts.latest, t);
          const inc = Math.abs(set.inclinationDeg - ts.latest.inclinationDeg);
          const inPlane = theta <= params.planeDeg;
          const nodeMatch = !inPlane && node <= params.nodeDeg && inc <= params.nodeInclinationDeg;
          if (!inPlane && !nodeMatch) continue;
          const key = pairKey(set.number, target);
          const existing = pairs.get(key);
          const evidence = (): Evidence => ({ thetaDeg: theta, nodeDeg: node, inclinationDeg: inc, deltaAKm: semiMajorAxisKm(set.meanMotion) - semiMajorAxisKm(ts.latest.meanMotion), deltaE: set.eccentricity - ts.latest.eccentricity, distanceKm: null, distanceLaterKm: null, nearestKm: existing?.nearestKm ?? null });
          if (existing !== undefined) {
            // Already watched: a plane verdict again only where the pair had drifted out of plane.
            if (inPlane && existing.lastTheta > 2 * params.planeDeg) { existing.planeAt = t; verdicts.push({ stage: "plane", state: "raised", chaser: existing.chaser, target: existing.target, at: t, publishedAt: set.createdMs, how, match: "plane", exclusion: existing.exclusion, evidence: evidence() }); }
            if (inPlane) existing.lastTheta = theta;
            continue;
          }
          const exclusion = rules.exclusionOf(seen(set.number), seen(target), t);
          if (exclusion === "same launch" || exclusion === "same owner") { counted[exclusion]++; continue; }
          if (nodeMatch) { verdicts.push({ stage: "plane", state: "raised", chaser: set.number, target, at: t, publishedAt: set.createdMs, how, match: "node", exclusion, evidence: evidence() }); continue; }
          pairs.set(key, { chaser: set.number, target, createdMs: t, exclusion, lastTheta: theta, outOfPlaneSinceMs: null, lastEvalMs: t, height: false, heightOffCount: 0, beside: "none", besideRaisedAt: null, besideConfirmedAt: null, leftRaisedAt: null, lastDistanceKm: null, nearestKm: null, planeAt: t, heightAt: null });
          verdicts.push({ stage: "plane", state: "raised", chaser: set.number, target, at: t, publishedAt: set.createdMs, how, match: "plane", exclusion, evidence: evidence() });
        }
      }
    }
    // Every watched pair the object is in, read with its new set.
    for (const [key, pair] of pairs) {
      if (pair.chaser !== set.number && pair.target !== set.number) continue;
      const cs = objects.get(pair.chaser)!.latest;
      const ts = objects.get(pair.target)!.latest;
      const tEval = Math.max(cs.epochMs, ts.epochMs);
      if (tEval - Math.min(cs.epochMs, ts.epochMs) > params.freshDays * DAY_MS) continue;
      readPair(key, pair, cs, ts, tEval, set.createdMs);
    }
  }

  function readPair(key: string, pair: PairState, cs: ElementSet, ts: ElementSet, t: number, publishedAt: number | null): void {
    const theta = planeAngleDeg(cs, ts, t);
    const node = nodeDifferenceDeg(cs, ts, t);
    const inc = Math.abs(cs.inclinationDeg - ts.inclinationDeg);
    const deltaA = semiMajorAxisKm(cs.meanMotion) - semiMajorAxisKm(ts.meanMotion);
    const deltaE = cs.eccentricity - ts.eccentricity;
    pair.lastTheta = theta;
    pair.lastEvalMs = t;
    const inPlane = theta <= params.planeDeg;
    if (!inPlane) { if (pair.outOfPlaneSinceMs === null) pair.outOfPlaneSinceMs = t; } else pair.outOfPlaneSinceMs = null;
    const near = inPlane && Math.abs(deltaA) <= 10 * params.heightKm;
    const d0 = near ? distanceKm(cs, ts, t) : null;
    const d1 = near ? distanceKm(cs, ts, t + params.holdHours * HOUR_MS) : null;
    // One object under two numbers is together from the first reading; a rendezvous is seen apart first.
    if (pair.nearestKm === null && pair.exclusion === null && rules.duplicate(d0, deltaA)) pair.exclusion = "duplicate";
    if (d0 !== null && (pair.nearestKm === null || d0 < pair.nearestKm)) pair.nearestKm = d0;
    const verdict = (stage: Stage, state: VerdictState): void => {
      verdicts.push({ stage, state, chaser: pair.chaser, target: pair.target, at: t, publishedAt, exclusion: pair.exclusion, evidence: { thetaDeg: theta, nodeDeg: node, inclinationDeg: inc, deltaAKm: deltaA, deltaE, distanceKm: d0, distanceLaterKm: d1, nearestKm: pair.nearestKm } });
    };
    // Height.
    if (!pair.height) {
      if (inPlane && Math.abs(deltaA) <= params.heightKm) { pair.height = true; pair.heightOffCount = 0; pair.heightAt = t; verdict("height", "raised"); }
    } else if (!inPlane || Math.abs(deltaA) > 2 * params.heightKm) {
      pair.heightOffCount++;
      if (pair.heightOffCount >= 2 && pair.beside === "none") { pair.height = false; pair.heightOffCount = 0; }
    } else pair.heightOffCount = 0;
    // Beside and left.
    const within = d0 !== null && d0 <= params.besideKm;
    const holds = d1 !== null && d1 <= params.besideKm;
    const far = d0 === null || d0 > params.leftKm || Math.abs(deltaA) > params.heightKm;
    const staysFar = d1 === null || d1 > params.leftKm;
    switch (pair.beside) {
      case "none":
        // A hold needs the heights matched at its raising too: a pair drifting through at 100 km a day is no hold, whatever one propagation says.
        if (pair.height && within && holds && Math.abs(deltaA) <= params.heightKm) { pair.beside = "raised"; pair.besideRaisedAt = t; verdict("beside", "raised"); }
        break;
      case "raised":
        if (within && t - pair.besideRaisedAt! >= params.confirmHours * HOUR_MS) { pair.beside = "confirmed"; pair.besideConfirmedAt = t; verdict("beside", "confirmed"); }
        else if (far && staysFar) { pair.beside = "none"; verdict("beside", "withdrawn"); }
        break;
      case "confirmed":
        if (far && staysFar) { pair.beside = "leaving"; pair.leftRaisedAt = t; verdict("left", "raised"); }
        break;
      case "leaving":
        if (far && t - pair.leftRaisedAt! >= params.confirmHours * HOUR_MS) { pair.beside = "none"; verdict("left", "confirmed"); if (Math.abs(deltaA) > 2 * params.heightKm) pair.height = false; }
        else if (within) { pair.beside = "confirmed"; verdict("left", "withdrawn"); }
        break;
    }
    pair.lastDistanceKm = d0;
    const age = t - pair.createdMs;
    if ((age > params.watchDays * DAY_MS && !pair.height && pair.beside === "none") || (pair.outOfPlaneSinceMs !== null && t - pair.outOfPlaneSinceMs > params.outOfPlaneDays * DAY_MS && pair.beside === "none")) pairs.delete(key);
  }

  // Pairs and objects nothing has touched for long are forgotten.
  let last: number | null = null;
  for (const s of input.sets) if (last === null || s.epochMs > last) last = s.epochMs;
  if (last !== null) {
    for (const [key, pair] of pairs) if (last - pair.lastEvalMs > 3 * params.freshDays * DAY_MS && pair.beside === "none") pairs.delete(key);
    for (const [n, s] of objects) if (last - s.latest.epochMs > 365 * DAY_MS) objects.delete(n);
  }
  return { verdicts, counted, states };
}
