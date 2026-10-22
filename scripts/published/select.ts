import type { Verdict } from "../../src/detector.ts";
import { DAY_MS } from "../../src/elements.ts";
import type { Body } from "../../src/exclusions.ts";
import { PUBLISHED_VERSION, type PublishedObject, type PublishedRendezvousDetail, type PublishedRendezvousEntry, type PublishedRendezvousFile, type PublishedStage, type PublishedState } from "../../src/published.ts";
import type { TruthFile } from "../../src/truth.ts";
import { MATCH_MARGIN_DAYS } from "../kpi/match.ts";

/**
 * Which rendezvous are fit to show, from the detector's verdicts: every
 * pair on which a hold was raised and that carries no exclusion tag. The
 * entry's state follows the pair's latest verdict: `beside` while raised
 * by one set, `confirmed` once a later set agreed, `left` once the chaser
 * moved away; a hold withdrawn as a bad fit, with no later hold on the
 * pair, is not shown, and leaves the list if it was. Each entry carries
 * the plane and height stages the detector saw before the hold, the
 * nearest distance read, and the ground-truth case it lands on with that
 * case's reports. The list grows: an entry once published stays, under
 * its id, and takes the state the latest run gives it.
 */

export interface Selection {
  list: PublishedRendezvousFile;
  details: PublishedRendezvousDetail[];
  /** The ids of entries in the previous list that the run no longer finds and that were never confirmed: left out as withdrawn. */
  dropped: string[];
}

const iso = (ms: number): string => new Date(ms).toISOString();
const dayOf = (ms: number): string => iso(ms).slice(0, 10);

const publishedObject = (n: number, designator: string | null, body: Body | undefined): PublishedObject => ({ catalogueNumber: n, designator: body?.launchTag ? designator ?? null : designator, name: body?.name ?? String(n), owner: body?.owner ?? null, ownerState: body?.ownerState ?? null, launchedOn: body?.launchedOn ?? null });

const stageOf = (v: Verdict | undefined): PublishedStage | null => (v === undefined ? null : { at: iso(v.at), publishedAt: v.publishedAt === null ? null : iso(v.publishedAt), distanceKm: v.evidence.distanceKm, deltaAKm: v.evidence.deltaAKm, thetaDeg: v.evidence.thetaDeg });

/** Builds the published files from a run's verdicts, merging into the list already published. */
export function selectPublished(verdicts: Verdict[], body: (n: number) => Body | undefined, designatorOf: (n: number) => string | null, truth: TruthFile, previous: PublishedRendezvousFile | null): Selection {
  const byPair = new Map<string, Verdict[]>();
  for (const v of verdicts) { const key = `${Math.min(v.chaser, v.target)}-${Math.max(v.chaser, v.target)}`; byPair.set(key, [...(byPair.get(key) ?? []), v]); }
  const entries = new Map<string, PublishedRendezvousEntry>();
  const details: PublishedRendezvousDetail[] = [];
  for (const [, vs] of byPair) {
    vs.sort((a, b) => a.at - b.at);
    if (vs.some((v) => v.exclusion !== null)) continue;
    // Each hold raised opens an entry; the verdicts up to the next raised hold belong to it.
    const raisedAt = vs.map((v, i) => (v.stage === "beside" && v.state === "raised" ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < raisedAt.length; k++) {
      const start = raisedAt[k]!;
      const end = k + 1 < raisedAt.length ? raisedAt[k + 1]! : vs.length;
      const own = vs.slice(start, end);
      const raised = own[0]!;
      const confirmed = own.find((v) => v.stage === "beside" && v.state === "confirmed");
      const withdrawn = own.find((v) => v.stage === "beside" && v.state === "withdrawn");
      if (withdrawn !== undefined && confirmed === undefined) continue;
      const left = own.find((v) => v.stage === "left" && (v.state === "raised" || v.state === "confirmed"));
      const leftWithdrawn = own.find((v) => v.stage === "left" && v.state === "withdrawn");
      const state: PublishedState = left !== undefined && !(leftWithdrawn !== undefined && leftWithdrawn.at > left.at) ? "left" : confirmed !== undefined ? "confirmed" : "beside";
      const before = vs.slice(0, start);
      const plane = stageOf(before.filter((v) => v.stage === "plane" && v.state === "raised").at(-1));
      const height = stageOf(before.filter((v) => v.stage === "height" && v.state === "raised").at(-1));
      let nearest: { km: number; at: number } | null = null;
      for (const v of own) if (v.evidence.distanceKm !== null && (nearest === null || v.evidence.distanceKm < nearest.km)) nearest = { km: v.evidence.distanceKm, at: v.at };
      const row = truth.cases.find((c) => c.regime === "LEO" && c.beside !== null && c.chaser.catalogueNumber !== null && ((c.chaser.catalogueNumber === raised.chaser && c.target.catalogueNumber === raised.target) || (c.chaser.catalogueNumber === raised.target && c.target.catalogueNumber === raised.chaser)) && c.window.from !== "" && raised.at >= Date.parse(`${c.window.from}T00:00:00Z`) - MATCH_MARGIN_DAYS * DAY_MS && (c.window.to === null || raised.at <= Date.parse(`${c.window.to}T00:00:00Z`) + (MATCH_MARGIN_DAYS + 1) * DAY_MS)) ?? null;
      const id = `${raised.chaser}-${raised.target}-${dayOf(raised.at)}`;
      const entry: PublishedRendezvousEntry = {
        id, state,
        chaser: publishedObject(raised.chaser, designatorOf(raised.chaser), body(raised.chaser)),
        target: publishedObject(raised.target, designatorOf(raised.target), body(raised.target)),
        regime: "LEO",
        besideAt: iso(raised.at), confirmedAt: confirmed ? iso(confirmed.at) : null, leftAt: state === "left" ? iso(left!.at) : null,
        plane, height,
        nearestKm: nearest?.km ?? null, nearestAt: nearest ? iso(nearest.at) : null,
        row: row?.id ?? null,
        reports: row === null ? [] : [...row.statements].sort((a, b) => a.statedOn.localeCompare(b.statedOn)).map((s) => ({ source: s.source, ref: s.ref, url: s.url, statedOn: s.statedOn })),
      };
      entries.set(id, entry);
      details.push({ version: PUBLISHED_VERSION, ...entry, verdicts: own.map((v) => ({ stage: v.stage, state: v.state, at: iso(v.at), publishedAt: v.publishedAt === null ? null : iso(v.publishedAt), distanceKm: v.evidence.distanceKm, distanceLaterKm: v.evidence.distanceLaterKm, deltaAKm: v.evidence.deltaAKm, thetaDeg: v.evidence.thetaDeg, exclusion: v.exclusion })) });
    }
  }
  const dropped: string[] = [];
  const merged = new Map<string, PublishedRendezvousEntry>();
  for (const e of previous?.rendezvous ?? []) {
    const now = entries.get(e.id);
    if (now !== undefined) merged.set(e.id, now);
    else if (e.state === "beside") dropped.push(e.id);
    else merged.set(e.id, e);
  }
  for (const [id, e] of entries) if (!merged.has(id)) merged.set(id, e);
  const list = [...merged.values()].sort((a, b) => a.besideAt.localeCompare(b.besideAt));
  return { list: { version: PUBLISHED_VERSION, rendezvous: list }, details, dropped };
}
