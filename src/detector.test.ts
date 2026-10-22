import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DETECTOR_PARAMETERS, newStates, runDetector, type Verdict } from "./detector.ts";
import { DAY_MS, HOUR_MS, type ElementSet } from "./elements.ts";
import { readExclusions, type Body } from "./exclusions.ts";
import { distanceKm } from "./propagation.ts";

/**
 * A synthetic rendezvous in a sun-synchronous orbit: the target circular at
 * 547 km, the chaser first 5 km lower and far behind, then at the target's
 * height a few kilometres behind (the hold), then 2.3 km higher and
 * drifting away (the departure). Each object publishes a set every eight
 * hours; the distances are read by SGP4 as the detector reads them.
 */

const exclusions = readExclusions(JSON.parse(readFileSync(new URL("../data/exclusions.json", import.meta.url), "utf8")));
const T0 = Date.parse("2026-10-01T00:00:00Z");
const TARGET = 59103;
const CHASER = 68762;
const MEAN_MOTION_547 = 15.19;

/** A set on a circular orbit: the semi-major axis as a mean motion, the position along the orbit as the argument of latitude, the node carried by J2 from the first epoch. */
function set(number: number, epochMs: number, meanMotion: number, latitudeDeg: number, over: Partial<ElementSet> = {}): ElementSet {
  const days = (epochMs - T0) / DAY_MS;
  return { number, designator: number === TARGET ? "2024-043F" : "2026-083H", epochMs, createdMs: epochMs + 3 * HOUR_MS, meanMotion, eccentricity: 0.0005, inclinationDeg: 97.85, raanDeg: 71.8 + 0.986 * days, argpDeg: 0, meanAnomalyDeg: ((latitudeDeg % 360) + 360) % 360, bstar: 0.0001, meanMotionDot: 0.00001, meanMotionDdot: 0, elementSetNumber: 999, revAtEpoch: 1, ...over };
}

const bodies = new Map<number, Body>([
  [TARGET, { number: TARGET, name: "ICEYE-X36", launchTag: "2024-043", kind: "payload", launchedOn: "2024-03-04", owner: "ICEUS", ownerState: "US", ownerDefence: false }],
  [CHASER, { number: CHASER, name: "Kosmos-2612", launchTag: "2026-083", kind: "payload", launchedOn: "2026-04-16", owner: "VVKOV", ownerState: "RU", ownerDefence: true }],
]);
const body = (n: number): Body | undefined => bodies.get(n);

/** The target's position along the orbit at an instant, as its sets print it: it moves at its mean motion. */
const targetLatitude = (epochMs: number): number => (MEAN_MOTION_547 * 360 * (epochMs - T0)) / DAY_MS;

function scenario(): { sets: ElementSet[]; holdFrom: number; leaveFrom: number } {
  const sets: ElementSet[] = [];
  const holdFrom = T0 + 12 * DAY_MS;
  const leaveFrom = T0 + 16 * DAY_MS;
  const step = 8 * HOUR_MS;
  for (let t = T0; t < T0 + 24 * DAY_MS; t += step) {
    sets.push(set(TARGET, t, MEAN_MOTION_547, targetLatitude(t)));
    const chaserT = t + 7 * 60_000;
    // Before the hold: 5 km lower (a faster orbit), well behind; on the hold: the target's orbit, 0.04 degrees of latitude behind (about 5 km); after: 2.3 km higher, drifting back.
    let n = MEAN_MOTION_547;
    let behind = 2;
    if (chaserT < holdFrom) { n = MEAN_MOTION_547 * (1 + (1.5 * 5) / 6925); behind = 2 - ((chaserT - T0) / DAY_MS) * 0.1; }
    else if (chaserT < leaveFrom) { behind = 0.04; }
    else { n = MEAN_MOTION_547 * (1 - (1.5 * 2.3) / 6925); behind = 0.04 + ((chaserT - leaveFrom) / DAY_MS) * 2.9; }
    sets.push(set(CHASER, chaserT, n, targetLatitude(chaserT) - behind));
  }
  sets.sort((a, b) => a.createdMs! - b.createdMs!);
  return { sets, holdFrom, leaveFrom };
}

describe("the detector on a synthetic rendezvous", () => {
  const { sets, holdFrom, leaveFrom } = scenario();
  const out = runDetector({ sets, body, exclusions }, newStates());
  const on = (stage: string, state: string): Verdict | undefined => out.verdicts.find((v) => v.stage === stage && v.state === state && v.chaser === CHASER && v.target === TARGET);

  it("builds a scenario SGP4 reads as a hold then a departure", () => {
    const during = sets.filter((s) => s.epochMs > holdFrom + DAY_MS && s.epochMs < leaveFrom - DAY_MS);
    const target = during.find((s) => s.number === TARGET)!;
    const chaser = during.find((s) => s.number === CHASER && s.epochMs > target.epochMs)!;
    expect(distanceKm(chaser, target, chaser.epochMs)!).toBeLessThan(20);
  });
  it("raises the height stage when the chaser reaches the target's orbit, and the hold at that set, held a day ahead", () => {
    const height = on("height", "raised")!;
    const beside = on("beside", "raised")!;
    expect(height).toBeDefined();
    expect(beside).toBeDefined();
    expect(beside.at).toBeGreaterThanOrEqual(holdFrom);
    expect(beside.at).toBeLessThan(holdFrom + DAY_MS);
    expect(beside.evidence.distanceKm!).toBeLessThan(DETECTOR_PARAMETERS.besideKm);
    expect(beside.evidence.distanceLaterKm!).toBeLessThan(DETECTOR_PARAMETERS.besideKm);
    expect(beside.exclusion).toBeNull();
  });
  it("confirms the hold by the next set and never withdraws it", () => {
    const beside = on("beside", "raised")!;
    const confirmed = on("beside", "confirmed")!;
    expect(confirmed).toBeDefined();
    expect(confirmed.at - beside.at).toBeGreaterThanOrEqual(DETECTOR_PARAMETERS.confirmHours * HOUR_MS);
    expect(confirmed.at - beside.at).toBeLessThan(DAY_MS);
    expect(on("beside", "withdrawn")).toBeUndefined();
  });
  it("raises the departure once the chaser is beyond the leaving distance, and confirms it", () => {
    const left = on("left", "raised")!;
    expect(left).toBeDefined();
    expect(left.at).toBeGreaterThan(leaveFrom);
    expect(left.at).toBeLessThan(leaveFrom + 3 * DAY_MS);
    expect(on("left", "confirmed")).toBeDefined();
  });
  it("tags nothing on a pair of different owners, launches and ages", () => {
    expect(out.verdicts.every((v) => v.exclusion === null)).toBe(true);
  });
  it("carries its states to a second run that goes on where the first stopped", () => {
    const half = Math.floor(sets.length / 2);
    const first = runDetector({ sets: sets.slice(0, half), body, exclusions }, newStates());
    const second = runDetector({ sets: sets.slice(half), body, exclusions }, first.states);
    const all = [...first.verdicts, ...second.verdicts];
    expect(all.filter((v) => v.stage === "beside" && v.state === "raised").length).toBe(out.verdicts.filter((v) => v.stage === "beside" && v.state === "raised").length);
    expect(all.find((v) => v.stage === "left" && v.state === "confirmed")).toBeDefined();
  });
});

describe("the detector's exclusions", () => {
  it("counts a pair of one owner at the plane stage and watches nothing of it", () => {
    const { sets } = scenario();
    const same = (n: number): Body | undefined => ({ ...bodies.get(n)!, owner: "VVKOV", ownerState: "RU", ownerDefence: true });
    const out = runDetector({ sets, body: same, exclusions }, newStates());
    expect(out.counted["same owner"]).toBeGreaterThan(0);
    expect(out.verdicts.filter((v) => v.stage === "beside")).toHaveLength(0);
  });
  it("tags a station's visitor and still reads the stages", () => {
    const { sets } = scenario();
    const visitor = (n: number): Body | undefined => (n === TARGET ? { ...bodies.get(n)!, name: "Progress MS-33" } : bodies.get(n));
    const out = runDetector({ sets, body: visitor, exclusions }, newStates());
    const beside = out.verdicts.find((v) => v.stage === "beside" && v.state === "raised");
    expect(beside?.exclusion).toBe("station visitor");
  });
});
