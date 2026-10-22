import type { Verdict } from "../../src/detector.ts";
import { DAY_MS } from "../../src/elements.ts";
import type { Exclusion } from "../../src/exclusions.ts";
import type { Case, TruthFile } from "../../src/truth.ts";

/**
 * How the scorecard lands the detector's verdicts on the ground truth's
 * cases. A verdict lands on a case when it names the case's pair, either
 * way round, and its instant falls in the case's window widened by
 * `MATCH_MARGIN_DAYS` (from the first stated day to the departure, or to
 * the span's end where no departure is stated). The beside stage is the
 * target: a case is detected when a hold was raised on it; the lead is
 * read against the earliest day a source stated the hold. A hold raised on
 * no case is false, unless it carries an exclusion (exempt), or was raised
 * less than `UNREPORTED_PENDING_DAYS` before the truth's date (pending,
 * since reports come after the event). A case whose chaser or target has
 * no public set in the span cannot be detected and is listed apart.
 */

export const MATCH_MARGIN_DAYS = 3;
export const UNREPORTED_PENDING_DAYS = 90;

export interface Span {
  from: string;
  to: string;
  cases?: string;
}

export interface StageLanding {
  /** The truth's window for the stage, or null where no source states it. */
  truth: { from: string; to: string } | null;
  /** The first verdict of the stage on the pair inside the case's window; null where none. */
  raisedAt: number | null;
  publishedAt: number | null;
  confirmedAt: number | null;
}

export interface CaseLanding {
  id: string;
  span: string;
  chaser: number | null;
  target: number;
  chaserVisible: boolean;
  targetVisible: boolean;
  /** The exclusion the detector's rules give the pair, where a verdict carries one; a case of one launch or one owner is never watched. */
  excluded: Exclusion | "same launch or owner, not watched" | null;
  plane: StageLanding;
  height: StageLanding;
  beside: StageLanding;
  left: StageLanding;
  /** The earliest day a source stated the hold, and the hours from the hold's first verdict's publication to its start (positive where the detector came first). */
  holdStatedOn: string | null;
  leadHours: number | null;
  nearestKm: number | null;
  outcome: "detected" | "missed" | "invisible" | "excluded" | "no hold in the truth";
}

export interface HoldLanding {
  chaser: number;
  target: number;
  raisedAt: number;
  publishedAt: number | null;
  confirmed: boolean;
  withdrawn: boolean;
  exclusion: Exclusion | null;
  landsOn: string | null;
  outcome: "detection" | "exempt" | "pending" | "false";
}

const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const margin = MATCH_MARGIN_DAYS * DAY_MS;

const onPair = (v: Verdict, chaser: number, target: number): boolean => (v.chaser === chaser && v.target === target) || (v.chaser === target && v.target === chaser);

/** The latest day the truth knows of: a statement's publication or a stated day. */
export function truthAsOf(truth: TruthFile): string {
  let latest = "";
  for (const c of truth.cases) {
    for (const s of c.statements) if (s.statedOn > latest) latest = s.statedOn;
    if (c.window.to !== null && c.window.to > latest) latest = c.window.to;
  }
  return latest;
}

/** When a hold raised at `raisedAt` on the pair ended: the next departure confirmed or hold withdrawn after it, or null while it is on. */
export function holdEndsAt(verdicts: Verdict[], raisedAt: number): number | null {
  const end = verdicts.filter((v) => v.at > raisedAt && ((v.stage === "left" && v.state === "confirmed") || (v.stage === "beside" && v.state === "withdrawn"))).sort((a, b) => a.at - b.at)[0];
  return end?.at ?? null;
}

/** The first verdict of a stage that lands in the window: raised inside it, or, for a hold, raised before it and still on when it opened. */
function stageLanding(verdicts: Verdict[], stage: Verdict["stage"], truthWindow: { from: string; to: string } | null, windowFrom: number, windowTo: number): StageLanding {
  const own = verdicts.filter((v) => v.stage === stage && v.match !== "node");
  const lands = (v: Verdict): boolean => v.at <= windowTo + margin && (v.at >= windowFrom - margin || (stage === "beside" && (holdEndsAt(verdicts, v.at) ?? Number.POSITIVE_INFINITY) > windowFrom - margin));
  const raised = own.find((v) => v.state === "raised" && lands(v)) ?? null;
  const confirmed = raised === null ? null : (own.find((v) => v.state === "confirmed" && v.at > raised.at) ?? null);
  return { truth: truthWindow, raisedAt: raised?.at ?? null, publishedAt: raised?.publishedAt ?? null, confirmedAt: confirmed?.at ?? null };
}

/** The cases of the truth a span covers, landed. */
export function landCases(truth: TruthFile, span: Span, verdicts: Verdict[], seen: (n: number) => boolean, neverWatched: (chaser: number, target: number) => boolean): CaseLanding[] {
  const landings: CaseLanding[] = [];
  for (const c of truth.cases) {
    if (c.regime !== "LEO" || c.window.from === "" || c.window.from < span.from || c.window.from > span.to) continue;
    const chaser = c.chaser.catalogueNumber;
    const target = c.target.catalogueNumber;
    const windowFrom = dayMs(c.window.from);
    const windowTo = dayMs(c.window.to ?? span.to) + DAY_MS;
    const pairVerdicts = chaser === null ? [] : verdicts.filter((v) => onPair(v, chaser, target));
    const w = (r: Case["beside"]): { from: string; to: string } | null => (r ? { from: r.value.from, to: r.value.to } : null);
    const plane = stageLanding(pairVerdicts, "plane", w(c.plane), windowFrom, windowTo);
    const height = stageLanding(pairVerdicts, "height", w(c.height), windowFrom, windowTo);
    const beside = stageLanding(pairVerdicts, "beside", w(c.beside), windowFrom, windowTo);
    const left = stageLanding(pairVerdicts, "left", w(c.left), windowFrom, windowTo);
    const chaserVisible = chaser !== null && seen(chaser);
    const targetVisible = seen(target);
    const tagged = pairVerdicts.find((v) => v.exclusion !== null)?.exclusion ?? null;
    const excluded: CaseLanding["excluded"] = tagged ?? (chaser !== null && neverWatched(chaser, target) ? "same launch or owner, not watched" : null);
    const holdStatedOn = c.statements.filter((s) => s.beside !== null).map((s) => s.statedOn).sort()[0] ?? null;
    const leadHours = beside.publishedAt !== null && holdStatedOn !== null ? (dayMs(holdStatedOn) - beside.publishedAt) / 3_600_000 : null;
    const nearest = pairVerdicts.reduce<number | null>((m, v) => (v.evidence.nearestKm !== null && (m === null || v.evidence.nearestKm < m) ? v.evidence.nearestKm : m), null);
    let outcome: CaseLanding["outcome"];
    if (!chaserVisible || !targetVisible) outcome = "invisible";
    else if (excluded !== null) outcome = "excluded";
    else if (c.beside === null) outcome = "no hold in the truth";
    else outcome = beside.raisedAt !== null ? "detected" : "missed";
    landings.push({ id: c.id, span: `${span.from} to ${span.to}`, chaser, target, chaserVisible, targetVisible, excluded, plane, height, beside, left, holdStatedOn, leadHours, nearestKm: nearest, outcome });
  }
  return landings;
}

/** Every hold raised in a span, landed on the truth or not. */
export function landHolds(truth: TruthFile, span: Span, verdicts: Verdict[], asOf: string): HoldLanding[] {
  const holds: HoldLanding[] = [];
  const pendingFrom = dayMs(asOf) - UNREPORTED_PENDING_DAYS * DAY_MS;
  for (const v of verdicts) {
    if (v.stage !== "beside" || v.state !== "raised") continue;
    const later = verdicts.filter((l) => l.stage === "beside" && onPair(l, v.chaser, v.target) && l.at > v.at);
    const confirmed = later.some((l) => l.state === "confirmed");
    const withdrawn = !confirmed && later.some((l) => l.state === "withdrawn");
    const endsAt = holdEndsAt(verdicts.filter((l) => onPair(l, v.chaser, v.target)), v.at) ?? Number.POSITIVE_INFINITY;
    const row = truth.cases.find((c) => c.regime === "LEO" && c.chaser.catalogueNumber !== null && onPair(v, c.chaser.catalogueNumber, c.target.catalogueNumber) && c.window.from !== "" && c.beside !== null && v.at <= dayMs(c.window.to ?? span.to) + DAY_MS + margin && (v.at >= dayMs(c.window.from) - margin || endsAt > dayMs(c.window.from) - margin)) ?? null;
    const outcome: HoldLanding["outcome"] = row !== null ? "detection" : v.exclusion !== null ? "exempt" : v.at >= pendingFrom ? "pending" : "false";
    holds.push({ chaser: v.chaser, target: v.target, raisedAt: v.at, publishedAt: v.publishedAt, confirmed, withdrawn, exclusion: v.exclusion, landsOn: row?.id ?? null, outcome });
  }
  return holds;
}
