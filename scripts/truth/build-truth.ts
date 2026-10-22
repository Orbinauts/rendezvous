import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { opensOn, readHandFile, type Case, type CatalogueObject, type Closest, type Confidence, type PlaneWindow, type Precision, type Resolved, type SourceKind, type Statement, type TruthFile, type Window } from "../../src/truth.ts";
import { readCatalogue, readOrgs } from "./gcat.ts";

/**
 * Builds the ground truth, `data/rendezvous.json`, from the hand files
 * and the GCAT snapshots, and writes its report, `docs/truth.md`. The
 * statements of one chaser and one target are grouped into cases: a
 * statement opens a new case where its first stated day comes more than
 * `SAME_CASE_DAYS` after the case's last, unless it states only a closest
 * pass or a departure, which join the pair's open case. Each stage is then
 * resolved from the statement that states it most finely, a tracking
 * company's measurement first on a tie, every disagreement is listed, and
 * the objects' names, launches and owners are the catalogue's. The file
 * carries no timestamp, so a rebuild makes no diff.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HAND_FILES = ["leo.json", "luch.json", "geo.json"];
/** A statement opening more than this many days after a case's last stated day is another case of the pair. */
export const SAME_CASE_DAYS = 120;
const DAY_MS = 86_400_000;

const PRECISION_RANK: Record<Precision, number> = { day: 0, month: 1, year: 2 };
/** A measurement first, then the operator's and a government's word, then an analyst's reading of public elements, a think tank's compilation, the news, the catalogue. */
const SOURCE_RANK: Record<SourceKind, number> = { tracker: 0, operator: 1, government: 2, analyst: 3, institute: 4, news: 5, catalogue: 6 };

const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);
const daysBetween = (a: string, b: string): number => Math.round((dayMs(b) - dayMs(a)) / DAY_MS);

function lastDayOf(s: Statement): string {
  const days: string[] = [];
  for (const w of [s.plane, s.height, s.beside, s.left]) if (w) days.push(w.to);
  if (s.closest?.on) days.push(s.closest.on);
  return days.sort().at(-1) ?? "";
}
function firstDayOf(s: Statement): string | null {
  const days: string[] = [];
  for (const w of [s.plane, s.height, s.beside, s.left]) if (w) days.push(w.from);
  if (s.closest?.on) days.push(s.closest.on);
  return days.sort()[0] ?? null;
}
const statesOnlyEnd = (s: Statement): boolean => s.plane === null && s.height === null && s.beside === null;

const pairKey = (s: Statement): string => `${s.chaser.catalogueNumber ?? `?${(s.chaser.candidates ?? []).join("|")}`}-${s.target.catalogueNumber}`;

/** Groups a pair's statements, sorted by their first stated day (undated last), into cases. */
function groupCases(statements: Statement[]): Statement[][] {
  const sorted = [...statements].sort((a, b) => (firstDayOf(a) ?? "9999").localeCompare(firstDayOf(b) ?? "9999"));
  const cases: { statements: Statement[]; last: string; open: boolean }[] = [];
  for (const s of sorted) {
    const first = firstDayOf(s);
    const current = cases.at(-1);
    if (current !== undefined) {
      const near = first !== null && daysBetween(current.last, first) <= SAME_CASE_DAYS;
      // A statement of only a pass or a departure joins the pair's open case, however late it comes.
      const endsOpen = statesOnlyEnd(s) && current.open;
      if (first === null || near || endsOpen) {
        current.statements.push(s);
        if (lastDayOf(s) > current.last) current.last = lastDayOf(s);
        if (s.left) current.open = false;
        continue;
      }
    }
    cases.push({ statements: [s], last: lastDayOf(s), open: s.left === null });
  }
  return cases.map((c) => c.statements);
}

/** A stage's window: the finest stated, the earliest on a tie, since a hold begins when the first source has it begin and a departure when the first has it leave; a disagreement of more than three days at the same precision is a conflict. */
function pick<T extends Window | PlaneWindow>(statements: Statement[], stage: "plane" | "height" | "beside" | "left"): { resolved: Resolved<T> | null; conflicts: string[] } {
  const stated = statements.map((s, i) => ({ s, i, w: s[stage] as T | null })).filter((x) => x.w !== null);
  if (stated.length === 0) return { resolved: null, conflicts: [] };
  stated.sort((a, b) => PRECISION_RANK[a.w!.precision] - PRECISION_RANK[b.w!.precision] || a.w!.from.localeCompare(b.w!.from) || SOURCE_RANK[a.s.source] - SOURCE_RANK[b.s.source] || a.i - b.i);
  const best = stated[0]!;
  const conflicts: string[] = [];
  for (const other of stated.slice(1)) {
    if (other.w!.precision !== best.w!.precision) continue;
    if (Math.abs(daysBetween(best.w!.from, other.w!.from)) > 3) conflicts.push(`${stage}: ${best.s.source} ${best.w!.from} against ${other.s.source} ${other.w!.from}`);
  }
  return { resolved: { value: best.w!, from: best.i }, conflicts };
}

const MEASURED: SourceKind[] = ["tracker", "operator", "government"];

/** The nearest pass: among the statements that give a distance at the finest precision, a measurement (a tracking company's, an operator's, a government's) before a reading of public elements, then the least distance; two statements of one day more than twofold apart are a conflict. */
function pickClosest(statements: Statement[]): { resolved: Resolved<Closest> | null; conflicts: string[] } {
  const stated = statements.map((s, i) => ({ s, i, c: s.closest })).filter((x) => x.c !== null);
  if (stated.length === 0) return { resolved: null, conflicts: [] };
  stated.sort((a, b) => (a.c!.km === null ? 1 : 0) - (b.c!.km === null ? 1 : 0) || PRECISION_RANK[a.c!.precision] - PRECISION_RANK[b.c!.precision] || (MEASURED.includes(a.s.source) ? 0 : 1) - (MEASURED.includes(b.s.source) ? 0 : 1) || (a.c!.km ?? 0) - (b.c!.km ?? 0) || a.i - b.i);
  const best = stated[0]!;
  const conflicts: string[] = [];
  for (const other of stated.slice(1)) {
    if (other.c!.km === null || best.c!.km === null || other.c!.on === null || other.c!.on !== best.c!.on) continue;
    const ratio = Math.max(best.c!.km, other.c!.km) / Math.max(Math.min(best.c!.km, other.c!.km), 0.01);
    if (ratio > 2) conflicts.push(`closest on ${best.c!.on}: ${best.s.source} ${best.c!.km} km against ${other.s.source} ${other.c!.km} km`);
  }
  return { resolved: { value: best.c!, from: best.i }, conflicts };
}

function confidenceOf(c: Pick<Case, "plane" | "height" | "beside" | "closest" | "left" | "statements">): Confidence {
  const measured = (r: Resolved<Window | PlaneWindow> | null): boolean => r !== null && r.value.precision === "day" && ["tracker", "operator", "government"].includes(c.statements[r.from]!.source);
  if ((c.closest && c.closest.value.km !== null && c.closest.value.precision === "day" && ["tracker", "operator", "government"].includes(c.statements[c.closest.from]!.source)) || measured(c.beside)) return "A";
  const precisions: Precision[] = [];
  for (const r of [c.plane, c.height, c.beside, c.left]) if (r) precisions.push(r.value.precision);
  if (c.closest) precisions.push(c.closest.value.precision);
  if (precisions.includes("day")) return "B";
  if (precisions.includes("month")) return "C";
  return "D";
}

export function buildTruth(): { file: TruthFile; report: string } {
  const hands = HAND_FILES.map((file) => ({ file, hand: readHandFile(file, JSON.parse(readFileSync(join(ROOT, "data/truth/hand", file), "utf8"))) }));
  const orgs = readOrgs(readFileSync(join(ROOT, "data/truth/sources/gcat-orgs.tsv"), "utf8"), "gcat-orgs.tsv");
  const catalogue = readCatalogue(readFileSync(join(ROOT, "data/truth/sources/gcat-satcat.tsv"), "utf8"), orgs, "gcat-satcat.tsv");
  const sources = JSON.parse(readFileSync(join(ROOT, "data/truth/sources.json"), "utf8"));
  const object = (n: number, where: string): CatalogueObject => {
    const o = catalogue.objects.get(n);
    if (o === undefined) throw new Error(`${where}: ${n} is not in the GCAT snapshot; run npm run truth:fetch`);
    return o;
  };
  const isDefence = (o: CatalogueObject): boolean => (o.ownerClass ?? "").includes("D");

  const byPair = new Map<string, Statement[]>();
  for (const { hand } of hands) for (const s of hand.statements) byPair.set(pairKey(s), [...(byPair.get(pairKey(s)) ?? []), s]);

  const cases: Case[] = [];
  for (const statements of byPair.values()) {
    for (const group of groupCases(statements)) {
      const first = group[0]!;
      const plane = pick<PlaneWindow>(group, "plane");
      const height = pick<Window>(group, "height");
      const beside = pick<Window>(group, "beside");
      const left = pick<Window>(group, "left");
      const closest = pickClosest(group);
      const target = object(first.target.catalogueNumber!, `${first.ref} target`);
      const chaser = first.chaser.catalogueNumber === null ? { catalogueNumber: null as null, name: first.chaser.name, candidates: first.chaser.candidates! } : object(first.chaser.catalogueNumber, `${first.ref} chaser`);
      const alsoNear = new Map<number, CatalogueObject>();
      for (const s of group) for (const o of s.alsoNear ?? []) if (o.catalogueNumber !== null) alsoNear.set(o.catalogueNumber, object(o.catalogueNumber, `${s.ref} alsoNear`));
      const partial = { plane: plane.resolved, height: height.resolved, beside: beside.resolved, closest: closest.resolved, left: left.resolved, statements: group };
      const opens = opensOn(partial);
      const relation = chaser.catalogueNumber === null ? null : {
        sameLaunch: catalogue.launchOf.get(chaser.catalogueNumber) === catalogue.launchOf.get(target.catalogueNumber),
        sameOwnerCode: chaser.owner === target.owner,
        sameState: chaser.ownerState === target.ownerState,
        bothDefence: isDefence(chaser) && isDefence(target),
      };
      const longitudes = group.map((s) => s.longitudeDeg).filter((l): l is number => typeof l === "number");
      cases.push({
        id: `${chaser.catalogueNumber ?? "gssap"}-${target.catalogueNumber}:${opens ?? "undated"}`,
        chaser, target, alsoNear: [...alsoNear.values()],
        regime: first.regime,
        longitudeDeg: longitudes[0] ?? null,
        relation,
        ...partial,
        window: { from: opens ?? "", to: left.resolved?.value.to ?? null },
        confidence: confidenceOf(partial),
        firstStatedOn: group.map((s) => s.statedOn).sort()[0]!,
        conflicts: [...plane.conflicts, ...height.conflicts, ...beside.conflicts, ...closest.conflicts, ...left.conflicts],
      });
    }
  }
  cases.sort((a, b) => a.window.from.localeCompare(b.window.from) || a.id.localeCompare(b.id));
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`two cases with the id ${c.id}`);
    ids.add(c.id);
  }

  const file: TruthFile = {
    format: 1,
    about: "The ground truth of public rendezvous: one case per chaser holding beside, or moving onto the orbit of, one target, built by scripts/truth/build-truth.ts from the hand files under data/truth/hand/ and the GCAT snapshots under data/truth/sources/. Never edited by hand.",
    builtFrom: { hand: HAND_FILES, gcat: { satcat: sources.snapshots["gcat-satcat"].snapshotSha256, orgs: sources.snapshots["gcat-orgs"].snapshotSha256, updated: catalogue.updated } },
    cases,
  };
  return { file, report: renderReport(file, hands.map((h) => h.hand.statements.length)) };
}

/** The truth's file as it is written: one indent, a newline at the end. */
export const truthText = (file: TruthFile): string => `${JSON.stringify(file, null, 1)}\n`;

function main(): void {
  const { file, report } = buildTruth();
  writeFileSync(join(ROOT, "data/rendezvous.json"), truthText(file));
  writeFileSync(join(ROOT, "docs/truth.md"), report);
  const dated = file.cases.filter((c) => c.window.from !== "");
  console.log(`${file.cases.length} cases from ${file.cases.reduce((n, c) => n + c.statements.length, 0)} statements; ${dated.length} dated; ${file.cases.filter((c) => c.conflicts.length > 0).length} with conflicts`);
}

const fmtWindow = (r: Resolved<Window> | null): string => (r === null ? "" : r.value.from === r.value.to ? r.value.from : `${r.value.from} to ${r.value.to}`) + (r && r.value.precision !== "day" ? ` (${r.value.precision})` : "");
const fmtClosest = (r: Resolved<Closest> | null): string => (r === null ? "" : `${r.value.km === null ? "?" : r.value.km} km${r.value.on ? ` on ${r.value.on}` : ""}${r.value.precision !== "day" ? ` (${r.value.precision})` : ""}`);
const owner = (o: CatalogueObject | { catalogueNumber: null; name: string; candidates: number[] }): string => (o.catalogueNumber === null ? "US" : `${o.owner} (${o.ownerState})`);
const objectCell = (o: CatalogueObject | { catalogueNumber: null; name: string; candidates: number[] }, stated: string): string => (o.catalogueNumber === null ? `${stated} (${o.candidates.join(", ")})` : `${stated} (${o.catalogueNumber}${o.name !== stated ? `, GCAT: ${o.name}` : ""})`);

function renderReport(file: TruthFile, counts: number[]): string {
  const lines: string[] = [];
  lines.push("# The ground truth, as built", "");
  lines.push(`Generated by \`npm run truth\` from ${counts.reduce((a, b) => a + b, 0)} statements (${HAND_FILES.map((f, i) => `${f}: ${counts[i]}`).join(", ")}) into ${file.cases.length} cases, against GCAT's catalogue updated ${file.builtFrom.gcat.updated}. A reviewer who disagrees with a row edits the hand file and rebuilds; \`data/rendezvous.json\` is never edited by hand.`, "");
  lines.push("Each case is one chaser and one target. The stages are the ones the detector raises: plane (the chaser within a fraction of a degree of the target's plane, by launch or by manoeuvre, with the separation where a source gives it), height (the semi-major axes matched), beside (the chaser holding near the target), closest (the nearest pass stated, in kilometres) and left (the chaser moving away). Each cell is the window the finest source states, with its precision where it is not a day; a blank is a stage no source states. The owner is GCAT's owner code and state. The confidence is A where a tracking company, an operator or a government states the day of the hold or of a measured pass, B where any source states a day, C a month, D a year.", "");
  for (const regime of ["LEO", "GEO"] as const) {
    const rows = file.cases.filter((c) => c.regime === regime && c.window.from !== "");
    lines.push(`## ${regime === "LEO" ? "Low Earth orbit" : "The geostationary belt"} (${rows.length} cases)`, "");
    lines.push("| Case | Chaser | Target | Owners | Plane | Height | Beside | Closest | Left | Conf. | Sources |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const c of rows) {
      const first = c.statements[0]!;
      const plane = c.plane === null ? "" : `${fmtWindow(c.plane)}, ${c.plane.value.how}${c.plane.value.separationDeg !== null ? `, ${c.plane.value.separationDeg}°` : ""}`;
      const rel = c.relation === null ? "" : c.relation.sameLaunch ? ", same launch" : c.relation.sameOwnerCode ? ", same owner" : c.relation.sameState ? ", same state" : "";
      lines.push(`| ${c.id} | ${objectCell(c.chaser, first.chaser.name)} | ${objectCell(c.target, first.target.name)}${c.alsoNear.length > 0 ? `; near ${c.alsoNear.map((o) => o.name).join(", ")}` : ""} | ${owner(c.chaser)} / ${owner(c.target)}${rel} | ${plane} | ${fmtWindow(c.height)} | ${fmtWindow(c.beside)} | ${fmtClosest(c.closest)} | ${fmtWindow(c.left)} | ${c.confidence} | ${c.statements.length} |`);
    }
    lines.push("");
  }
  const undated = file.cases.filter((c) => c.window.from === "");
  if (undated.length > 0) {
    lines.push("## Cases with no dated stage (kept out of scoring)", "");
    for (const c of undated) lines.push(`- ${c.id}: ${c.statements.map((s) => s.ref).join("; ")}`);
    lines.push("");
  }
  lines.push("## Conflicts between sources", "");
  const conflicted = file.cases.filter((c) => c.conflicts.length > 0);
  if (conflicted.length === 0) lines.push("None.", "");
  else {
    lines.push("| Case | Disagreement |", "| --- | --- |");
    for (const c of conflicted) for (const k of c.conflicts) lines.push(`| ${c.id} | ${k} |`);
    lines.push("");
  }
  lines.push("## Counts", "");
  const by = <K extends string>(f: (c: Case) => K): string => { const m = new Map<K, number>(); for (const c of file.cases) m.set(f(c), (m.get(f(c)) ?? 0) + 1); return [...m.entries()].sort().map(([k, v]) => `${k} ${v}`).join(", "); };
  lines.push(`- By regime: ${by((c) => c.regime)}.`);
  lines.push(`- By confidence: ${by((c) => c.confidence)}.`);
  lines.push(`- By year of opening: ${by((c) => c.window.from.slice(0, 4) || "undated")}.`);
  lines.push(`- By relation: ${by((c) => (c.relation === null ? "chaser unidentified" : c.relation.sameLaunch ? "same launch" : c.relation.sameOwnerCode ? "same owner code" : c.relation.sameState ? "same state, different owner codes" : "different states"))}.`);
  lines.push(`- Stages stated: plane ${file.cases.filter((c) => c.plane).length}, height ${file.cases.filter((c) => c.height).length}, beside ${file.cases.filter((c) => c.beside).length}, closest ${file.cases.filter((c) => c.closest).length}, left ${file.cases.filter((c) => c.left).length}.`);
  lines.push("");
  lines.push("## Sources", "");
  const refs = new Map<string, number>();
  for (const c of file.cases) for (const s of c.statements) refs.set(`${s.source}: ${s.ref}${s.url ? ` <${s.url}>` : ""}`, (refs.get(`${s.source}: ${s.ref}${s.url ? ` <${s.url}>` : ""}`) ?? 0) + 1);
  for (const [ref, n] of [...refs.entries()].sort()) lines.push(`- ${ref} (${n})`);
  lines.push("");
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
