import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { DETECTOR_NAME, DETECTOR_PARAMETERS, type Verdict } from "../../src/detector.ts";
import { ExclusionRules, readExclusions, type Exclusion } from "../../src/exclusions.ts";
import type { TruthFile } from "../../src/truth.ts";
import { readCatalogue } from "../replay/catalogue.ts";
import { replaySpan } from "../replay/run.ts";
import { landCases, landHolds, truthAsOf, type CaseLanding, type HoldLanding, type Span } from "./match.ts";

/**
 * The scorecard: replays the detector over every span of `data/spans.json`,
 * lands what it raised on the ground truth, and writes the aggregate,
 * `kpi/latest.json` and `kpi/latest.md`, which the README's tables are
 * read from. `npm run kpi -- --gcat <dir> [--archives <dir>,<dir>]
 * [--rematch]`: each span's replay is kept under `kpi/work/`, and
 * `--rematch` lands the kept replays again without replaying, so a change
 * to the matching never needs one.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const WORK = join(ROOT, "kpi/work");

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || process.argv[i + 1] === undefined) { if (fallback !== undefined) return fallback; throw new Error(`--${name} needed`); }
  return process.argv[i + 1]!;
}

interface KeptReplay {
  /** The detector's code the replay was made with: a change to it makes the kept replay stale. */
  code: string;
  from: string;
  to: string;
  gcatUpdated: string;
  missingDays: string[];
  verdicts: Verdict[];
  counted: Record<Exclusion, number>;
  /** The objects the detector saw a set of, and the pairs it counted and did not watch. */
  seen: number[];
  countedPairs: string[];
}

export interface Latest {
  detector: string;
  parameters: typeof DETECTOR_PARAMETERS;
  truthSha256: string;
  exclusionsSha256: string;
  truthAsOf: string;
  gcatUpdated: string;
  spans: { from: string; to: string; cases?: string; verdicts: number; holdsRaised: number; missingDays: string[] }[];
  cases: CaseLanding[];
  holds: HoldLanding[];
  totals: {
    cases: number; visible: number; invisible: number; excluded: number; withHold: number; detected: number; missed: number;
    holdsRaised: number; detections: number; exempt: number; pending: number; false: number; confirmed: number; withdrawn: number;
    planeTruth: number; planeDetected: number; heightTruth: number; heightDetected: number;
    medianLeadHours: number | null;
  };
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

function main(): void {
  const gcat = arg("gcat");
  const archives = arg("archives", `${resolve(ROOT, "../rendezvous-archive")},${resolve(ROOT, "../breakups-archive")}`).split(",");
  const rematch = process.argv.includes("--rematch");
  const truthText = readFileSync(join(ROOT, "data/rendezvous.json"), "utf8");
  const truth = JSON.parse(truthText) as TruthFile;
  const exclusionsText = readFileSync(join(ROOT, "data/exclusions.json"), "utf8");
  const code = sha256(["src/detector.ts", "src/exclusions.ts", "src/elements.ts", "src/propagation.ts"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n") + exclusionsText);
  const rules = new ExclusionRules(readExclusions(JSON.parse(exclusionsText)));
  const catalogue = readCatalogue(join(gcat, "satcat.tsv"), join(gcat, "orgs.tsv"));
  const neverWatched = (a: number, b: number): boolean => { const e = rules.exclusionOf({ body: catalogue.body(a), designator: null, firstSeenMs: null }, { body: catalogue.body(b), designator: null, firstSeenMs: null }, Date.parse("2026-01-01T00:00:00Z")); return e === "same launch" || e === "same owner"; };
  const spans = (JSON.parse(readFileSync(join(ROOT, "data/spans.json"), "utf8")) as { spans: Span[] }).spans;
  mkdirSync(WORK, { recursive: true });
  const asOf = truthAsOf(truth);
  const latest: Latest = { detector: DETECTOR_NAME, parameters: DETECTOR_PARAMETERS, truthSha256: sha256(truthText), exclusionsSha256: sha256(exclusionsText), truthAsOf: asOf, gcatUpdated: "", spans: [], cases: [], holds: [], totals: { cases: 0, visible: 0, invisible: 0, excluded: 0, withHold: 0, detected: 0, missed: 0, holdsRaised: 0, detections: 0, exempt: 0, pending: 0, false: 0, confirmed: 0, withdrawn: 0, planeTruth: 0, planeDetected: 0, heightTruth: 0, heightDetected: 0, medianLeadHours: null } };
  for (const span of spans) {
    const kept = join(WORK, `${span.from}-to-${span.to}.json.gz`);
    let replay: KeptReplay | null = null;
    if (rematch && existsSync(kept)) {
      replay = JSON.parse(gunzipSync(readFileSync(kept)).toString("utf8")) as KeptReplay;
      if (replay.code !== code) { console.error(`${span.from} to ${span.to}: kept replay made with other code, replaying`); replay = null; }
    }
    if (replay === null) {
      const r = replaySpan(span.from, span.to, gcat, archives, (line) => console.error(line));
      replay = { code, from: r.from, to: r.to, gcatUpdated: r.gcatUpdated, missingDays: r.missingDays, verdicts: r.verdicts, counted: r.counted, seen: [...r.states.objects.keys()], countedPairs: [] };
      writeFileSync(kept, gzipSync(JSON.stringify(replay)));
    }
    latest.gcatUpdated = replay.gcatUpdated;
    const seen = new Set(replay.seen);
    const cases = landCases(truth, span, replay.verdicts, (n) => seen.has(n), neverWatched);
    const holds = landHolds(truth, span, replay.verdicts, asOf);
    latest.spans.push({ ...span, verdicts: replay.verdicts.length, holdsRaised: holds.length, missingDays: replay.missingDays });
    latest.cases.push(...cases);
    latest.holds.push(...holds);
    console.error(`${span.from} to ${span.to}: ${cases.length} cases, ${holds.length} holds raised`);
  }
  const t = latest.totals;
  t.cases = latest.cases.length;
  for (const c of latest.cases) {
    if (c.outcome === "invisible") t.invisible++; else t.visible++;
    if (c.outcome === "excluded") t.excluded++;
    if (c.outcome === "detected" || c.outcome === "missed") t.withHold++;
    if (c.outcome === "detected") t.detected++;
    if (c.outcome === "missed") t.missed++;
    if (c.outcome !== "invisible" && c.outcome !== "excluded") {
      if (c.plane.truth !== null) { t.planeTruth++; if (c.plane.raisedAt !== null) t.planeDetected++; }
      if (c.height.truth !== null) { t.heightTruth++; if (c.height.raisedAt !== null) t.heightDetected++; }
    }
  }
  for (const h of latest.holds) {
    t.holdsRaised++;
    t[h.outcome === "detection" ? "detections" : h.outcome]++;
    if (h.confirmed) t.confirmed++;
    if (h.withdrawn) t.withdrawn++;
  }
  const leads = latest.cases.filter((c) => c.outcome === "detected" && c.leadHours !== null).map((c) => c.leadHours!).sort((a, b) => a - b);
  t.medianLeadHours = leads.length === 0 ? null : leads[Math.floor(leads.length / 2)]!;
  writeFileSync(join(ROOT, "kpi/latest.json"), `${JSON.stringify(latest, null, 1)}\n`);
  writeFileSync(join(ROOT, "kpi/latest.md"), renderLatest(latest, truth, catalogue));
  console.error(`${t.detected} of ${t.withHold} holds detected; ${t.false} false, ${t.pending} pending, ${t.exempt} exempt of ${t.holdsRaised} raised`);
}

const iso = (ms: number | null): string => (ms === null ? "" : new Date(ms).toISOString().slice(0, 16).replace("T", " "));

export function renderLatest(latest: Latest, truth: TruthFile, catalogue: { body: (n: number) => { name: string } | undefined }): string {
  const t = latest.totals;
  const name = (n: number | null): string => (n === null ? "?" : (catalogue.body(n)?.name ?? String(n)));
  const caseName = (id: string): string => { const c = truth.cases.find((x) => x.id === id); return c ? `${c.chaser.name} and ${c.target.name}` : id; };
  const lines: string[] = [];
  lines.push(`# The scorecard`, "");
  lines.push(`Detector \`${latest.detector}\`, replayed over ${latest.spans.length} spans (${latest.spans.map((s) => `${s.from} to ${s.to}`).join("; ")}), landed on the ground truth as of ${latest.truthAsOf} (sha256 ${latest.truthSha256.slice(0, 12)}) with the exclusions file (sha256 ${latest.exclusionsSha256.slice(0, 12)}) and GCAT's catalogue of ${latest.gcatUpdated}.`, "");
  lines.push("## The headline", "");
  lines.push("<!-- kpi:summary:begin -->", "");
  lines.push("| Holds in the truth a public-data detector can see | Result |", "| --- | --- |");
  lines.push(`| Holds detected | ${t.detected} of ${t.withHold} |`);
  lines.push(`| Holds raised that were false | ${t.false} of ${t.detections + t.false} (${t.pending} pending a report, ${t.exempt} exempt by an exclusion tag) |`);
  lines.push(`| Holds confirmed by a later set, withdrawn as a bad fit | ${t.confirmed}, ${t.withdrawn} |`);
  lines.push(`| Median lead of a hold over the first public statement of it | ${t.medianLeadHours === null ? "none measured" : `${Math.round(t.medianLeadHours)} hours`} |`);
  lines.push(`| Cases the public data cannot show (a chaser or target with no public sets) | ${t.invisible} of ${t.cases} |`);
  lines.push(`| Cases of one launch or one owner, left out by data | ${t.excluded} of ${t.cases} |`);
  lines.push(`| Plane stage raised on cases that state one; height stage | ${t.planeDetected} of ${t.planeTruth}; ${t.heightDetected} of ${t.heightTruth} |`);
  lines.push("", "<!-- kpi:summary:end -->", "");
  lines.push("## Every case in the spans", "");
  lines.push("| Case | Span | Outcome | Plane (truth; raised) | Height | Hold raised; confirmed | Left | First statement of the hold; lead | Nearest |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  const w = (s: { from: string; to: string } | null): string => (s === null ? "none" : s.from === s.to ? s.from : `${s.from} to ${s.to}`);
  for (const c of latest.cases) {
    lines.push(`| ${c.id} ${caseName(c.id)} | ${c.span} | ${c.outcome}${c.excluded ? ` (${c.excluded})` : ""}${!c.targetVisible ? " (target has no public sets)" : !c.chaserVisible ? " (chaser has no public sets)" : ""} | ${w(c.plane.truth)}; ${iso(c.plane.raisedAt) || "none"} | ${w(c.height.truth)}; ${iso(c.height.raisedAt) || "none"} | ${w(c.beside.truth)}; ${iso(c.beside.raisedAt) || "none"}; ${iso(c.beside.confirmedAt) || "none"} | ${w(c.left.truth)}; ${iso(c.left.raisedAt) || "none"} | ${c.holdStatedOn ?? "none"}; ${c.leadHours === null ? "" : `${Math.round(c.leadHours)} h`} | ${c.nearestKm === null ? "" : `${c.nearestKm.toFixed(1)} km`} |`);
  }
  lines.push("");
  lines.push("## Every hold raised", "");
  lines.push("| Raised | Chaser | Target | Outcome | Tag | Confirmed | Withdrawn | Lands on |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const h of latest.holds) lines.push(`| ${iso(h.raisedAt)} | ${name(h.chaser)} (${h.chaser}) | ${name(h.target)} (${h.target}) | ${h.outcome} | ${h.exclusion ?? ""} | ${h.confirmed ? "yes" : ""} | ${h.withdrawn ? "yes" : ""} | ${h.landsOn ?? ""} |`);
  lines.push("");
  lines.push("## The spans", "");
  lines.push("| Span | Cases | Verdicts | Holds raised | Missing days |", "| --- | --- | --- | --- | --- |");
  for (const s of latest.spans) lines.push(`| ${s.from} to ${s.to} | ${s.cases ?? ""} | ${s.verdicts} | ${s.holdsRaised} | ${s.missingDays.length} |`);
  lines.push("");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
