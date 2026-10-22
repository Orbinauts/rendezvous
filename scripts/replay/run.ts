import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { newStates, runDetector, type DetectorStates, type Verdict } from "../../src/detector.ts";
import { DAY_MS, type ElementSet } from "../../src/elements.ts";
import { readExclusions, type Exclusion } from "../../src/exclusions.ts";
import type { TruthFile } from "../../src/truth.ts";
import { readCatalogue } from "./catalogue.ts";
import { dayAfter, dayOf, slices, yearColumns, type DaySource } from "./sources.ts";

/**
 * Replays the detector over a span of days, set by set in the order the
 * catalogue published them, and writes what fired:
 * `npm run replay -- --from <day> --to <day> --gcat <dir> [--archives <dir>,<dir>]`.
 * The sets come from history slices where an Archive holds them (a set read
 * when it was published), else from breakups' year columns (a set read on
 * the day of its epoch). Writes `docs/replay/<from>-to-<to>.json` (every
 * verdict) and `.md` (the tables), and returns the verdicts to a caller
 * (`replaySpan`) for the scorecard.
 */

const ROOT = resolve(import.meta.dirname, "../..");

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || process.argv[i + 1] === undefined) { if (fallback !== undefined) return fallback; throw new Error(`--${name} needed`); }
  return process.argv[i + 1]!;
}

export interface ReplayResult {
  from: string;
  to: string;
  archives: string[];
  gcatUpdated: string;
  missingDays: string[];
  verdicts: Verdict[];
  counted: Record<Exclusion, number>;
  states: DetectorStates;
}

/** Replays the span: each day's sets admitted when they were published (slices of the next two days read ahead and held until then), the detector run once a day over them. */
export function replaySpan(from: string, to: string, gcat: string, archives: string[], log: (line: string) => void = () => {}): ReplayResult {
  const catalogue = readCatalogue(join(gcat, "satcat.tsv"), join(gcat, "orgs.tsv"));
  const exclusions = readExclusions(JSON.parse(readFileSync(join(ROOT, "data/exclusions.json"), "utf8")));
  const years = new Set<number>();
  for (let d = from; d <= to; d = dayAfter(d)) years.add(Number(d.slice(0, 4)));
  const sources = new Map<number, DaySource>();
  for (const y of years) {
    const s = slices(archives, y);
    sources.set(y, s.sets(`${y}-01-15`) !== null || s.sets(from) !== null ? s : yearColumns(archives.find((a) => existsSync(join(a, String(y), "epoch.bin.gz")))!, y));
  }
  let states = newStates();
  const verdicts: Verdict[] = [];
  const counted: Record<Exclusion, number> = { "same launch": 0, "same owner": 0, "station visitor": 0, "dispersing stack": 0, fragment: 0, duplicate: 0 };
  let pending: ElementSet[] = [];
  let loadedThrough = dayOf(Date.parse(`${from}T00:00:00Z`) - DAY_MS);
  const missing: string[] = [];
  const started = Date.now();
  for (let day = from; day <= to; day = dayAfter(day)) {
    const ahead = dayOf(Date.parse(`${day}T00:00:00Z`) + 2 * DAY_MS);
    while (loadedThrough < ahead) {
      loadedThrough = dayAfter(loadedThrough);
      const sets = sources.get(Number(loadedThrough.slice(0, 4)))?.sets(loadedThrough) ?? null;
      if (sets === null) { if (loadedThrough <= to) missing.push(loadedThrough); continue; }
      for (const s of sets) pending.push(s);
    }
    const end = Date.parse(`${day}T00:00:00Z`) + DAY_MS;
    const admitted: ElementSet[] = [];
    const kept: ElementSet[] = [];
    for (const s of pending) ((s.createdMs ?? s.epochMs) < end ? admitted : kept).push(s);
    pending = kept;
    admitted.sort((a, b) => (a.createdMs ?? a.epochMs) - (b.createdMs ?? b.epochMs) || a.epochMs - b.epochMs);
    const out = runDetector({ sets: admitted, body: catalogue.body, exclusions }, states);
    states = out.states;
    for (const v of out.verdicts) verdicts.push(v);
    for (const k of Object.keys(counted) as Exclusion[]) counted[k] += out.counted[k];
    if (day.endsWith("-01") || day === to) log(`${day}: ${admitted.length} sets, ${states.pairs.size} pairs watched, ${verdicts.length} verdicts, ${Math.round((Date.now() - started) / 1000)} s`);
  }
  return { from, to, archives, gcatUpdated: catalogue.updated, missingDays: missing, verdicts, counted, states };
}

const iso = (ms: number | null): string => (ms === null ? "" : new Date(ms).toISOString().slice(0, 16).replace("T", " "));

export function renderReplay(out: Omit<ReplayResult, "states">, catalogue: { body: (n: number) => { name: string; owner: string; ownerState: string } | undefined }): string {
  const truth = JSON.parse(readFileSync(join(ROOT, "data/rendezvous.json"), "utf8")) as TruthFile;
  const name = (n: number): string => { const b = catalogue.body(n); return b ? `${b.name} (${n}, ${b.owner || "?"}/${b.ownerState || "?"})` : `${n}`; };
  const lines: string[] = [];
  lines.push(`# Replay ${out.from} to ${out.to}`, "");
  lines.push(`The detector replayed over every low-orbit object's sets, each read when it was published, with GCAT's catalogue of ${out.gcatUpdated} for names, kinds and owners. ${out.missingDays.length === 0 ? "No day missing." : `Days with no sets: ${out.missingDays.join(", ")}.`}`, "");
  lines.push("## The ground truth's cases, as the replay read them", "");
  lines.push("| Case | Truth: plane; height; beside; closest; left | Replay: plane raised | height raised | beside raised | beside confirmed | left raised | nearest |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
  const inSpan = truth.cases.filter((c) => c.regime === "LEO" && c.window.from >= out.from.slice(0, 4) && c.window.from <= out.to);
  const onPair = (v: Verdict, c: (typeof inSpan)[number]): boolean => (v.chaser === c.chaser.catalogueNumber && v.target === c.target.catalogueNumber) || (v.target === c.chaser.catalogueNumber && v.chaser === c.target.catalogueNumber);
  for (const c of inSpan) {
    if (c.chaser.catalogueNumber === null) continue;
    const vs = out.verdicts.filter((v) => onPair(v, c));
    const first = (stage: string, state: string): string => { const v = vs.find((x) => x.stage === stage && x.state === state); return v ? `${iso(v.at)}${v.chaser !== c.chaser.catalogueNumber ? " (reversed)" : ""}${v.how === "launch" ? " at launch" : ""}` : "none"; };
    const nearest = vs.reduce<number | null>((m, v) => (v.evidence.nearestKm !== null && (m === null || v.evidence.nearestKm < m) ? v.evidence.nearestKm : m), null);
    const w = (x: { value: { from: string; to: string } } | null): string => (x ? (x.value.from === x.value.to ? x.value.from : `${x.value.from} to ${x.value.to}`) : "none");
    lines.push(`| ${c.id} ${c.chaser.name} and ${c.target.name} | ${w(c.plane)}; ${w(c.height)}; ${w(c.beside)}; ${c.closest ? `${c.closest.value.km ?? "?"} km on ${c.closest.value.on ?? "?"}` : "none"}; ${w(c.left)} | ${first("plane", "raised")} | ${first("height", "raised")} | ${first("beside", "raised")} | ${first("beside", "confirmed")} | ${first("left", "raised")} | ${nearest === null ? "" : `${nearest.toFixed(1)} km`} |`);
  }
  lines.push("");
  const truthPairs = new Set(inSpan.map((c) => `${c.chaser.catalogueNumber}-${c.target.catalogueNumber}`));
  const isTruth = (v: Verdict): boolean => truthPairs.has(`${v.chaser}-${v.target}`) || truthPairs.has(`${v.target}-${v.chaser}`);
  const holds = out.verdicts.filter((v) => v.stage === "beside" && v.state === "raised");
  lines.push(`## Every hold raised (${holds.length})`, "");
  lines.push("| Raised at | Chaser | Target | Exclusion | θ° | Δa km | distance km | in 24 h | confirmed | left | In the truth |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const v of holds) {
    const later = (stage: string, state: string): Verdict | undefined => out.verdicts.find((l) => l.stage === stage && l.state === state && l.chaser === v.chaser && l.target === v.target && l.at > v.at);
    const confirmed = later("beside", "confirmed");
    const withdrawn = later("beside", "withdrawn");
    const left = later("left", "raised");
    const confirmedCell = confirmed !== undefined ? iso(confirmed.at) : withdrawn !== undefined ? "withdrawn" : "no";
    lines.push(`| ${iso(v.at)} | ${name(v.chaser)} | ${name(v.target)} | ${v.exclusion ?? ""} | ${v.evidence.thetaDeg.toFixed(3)} | ${v.evidence.deltaAKm.toFixed(2)} | ${v.evidence.distanceKm?.toFixed(1) ?? ""} | ${v.evidence.distanceLaterKm?.toFixed(1) ?? ""} | ${confirmedCell} | ${left !== undefined ? iso(left.at) : "no"} | ${isTruth(v) ? "yes" : ""} |`);
  }
  lines.push("");
  const count = (stage: string, state: string, f: (v: Verdict) => boolean = () => true): number => out.verdicts.filter((v) => v.stage === stage && v.state === state && f(v)).length;
  lines.push("## What fired, by stage", "");
  lines.push("| Stage | Raised | On the truth's pairs | Tagged station visitor | Tagged dispersing stack | Tagged fragment | Tagged duplicate | Untagged | Confirmed | Withdrawn |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const stage of ["plane", "height", "beside", "left"]) lines.push(`| ${stage} | ${count(stage, "raised")} | ${count(stage, "raised", isTruth)} | ${count(stage, "raised", (v) => v.exclusion === "station visitor")} | ${count(stage, "raised", (v) => v.exclusion === "dispersing stack")} | ${count(stage, "raised", (v) => v.exclusion === "fragment")} | ${count(stage, "raised", (v) => v.exclusion === "duplicate")} | ${count(stage, "raised", (v) => v.exclusion === null && !isTruth(v))} | ${count(stage, "confirmed")} | ${count(stage, "withdrawn")} |`);
  lines.push("");
  lines.push(`Plane verdicts by the node-only test (not watched): ${out.verdicts.filter((v) => v.match === "node").length}. Pairs counted at the plane stage and not watched: ${Object.entries(out.counted).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}.`, "");
  const byChaser = new Map<number, Verdict[]>();
  for (const v of out.verdicts) if (v.exclusion === null && !isTruth(v) && v.state === "raised" && v.match !== "node" && (v.stage === "plane" || v.stage === "height")) byChaser.set(v.chaser, [...(byChaser.get(v.chaser) ?? []), v]);
  const top = [...byChaser.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 30);
  lines.push(`## Untagged plane and height verdicts, by chaser (${byChaser.size} chasers; the ${top.length} with most)`, "");
  lines.push("| Chaser | plane | height | first | last | targets (first five) |", "| --- | --- | --- | --- | --- | --- |");
  for (const [n, vs] of top) lines.push(`| ${name(n)} | ${vs.filter((v) => v.stage === "plane").length} | ${vs.filter((v) => v.stage === "height").length} | ${iso(vs[0]!.at)} | ${iso(vs.at(-1)!.at)} | ${[...new Set(vs.map((v) => v.target))].slice(0, 5).map((t) => catalogue.body(t)?.name ?? String(t)).join(", ")} |`);
  lines.push("");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const from = arg("from");
  const to = arg("to");
  const gcat = arg("gcat");
  const archives = arg("archives", `${resolve(ROOT, "../rendezvous-archive")},${resolve(ROOT, "../breakups-archive")}`).split(",");
  const result = replaySpan(from, to, gcat, archives, (line) => console.error(line));
  const { states: _states, ...out } = result;
  mkdirSync(join(ROOT, "docs/replay"), { recursive: true });
  writeFileSync(join(ROOT, "docs/replay", `${from}-to-${to}.json`), JSON.stringify(out));
  writeFileSync(join(ROOT, "docs/replay", `${from}-to-${to}.md`), renderReplay(out, readCatalogue(join(gcat, "satcat.tsv"), join(gcat, "orgs.tsv"))));
  console.error(`${out.verdicts.length} verdicts; missing days: ${out.missingDays.length}`);
}
