import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { ElementSet, Verdict } from "../../src/index.ts";
import { credentialsFromEnv, SpaceTrack } from "../archive/space-track.ts";
import { readCatalogue } from "../replay/catalogue.ts";
import { upload } from "./data.ts";
import { checkFrozen, FROZEN_DETECTOR, frozenDirOf, installedVersions, loadFrozen, type Frozen } from "./frozen.ts";
import { ensureGcat } from "./gcat.ts";
import { git } from "./git.ts";
import { runUrlOf } from "./github.ts";
import { BRANCH, jsonl, newVerdicts, readJsonl, RUNS_FILE, unlogged, VERDICTS_FILE, type LoggedVerdict, type RunLine } from "./log.ts";
import { latestCreated, pullSince } from "./pull.ts";

/**
 * The live run: `npm run live`, from this repository, which the scheduled
 * workflow `.github/workflows/live.yml` runs every hour on a fresh runner.
 * It pulls from the catalogue's history class every set published since
 * the last run (`setsThrough` of the last line of `runs.jsonl` on the
 * `live` branch), through the throttled client that writes each request
 * to the ledger `requests.log`, and reads them through the detector
 * frozen at the tag `frozen-beside-v1`, loaded from its own worktree and
 * never from this branch, from the states the last run ended with
 * (`states.json.gz`, downloaded from the release `live-data` before the
 * run). Every verdict raised is appended to `verdicts.jsonl` on the `live`
 * branch, with a line for the run in `runs.jsonl`, and the branch is
 * committed and pushed: the commit time is the proof of when each verdict
 * was known, and the run's log on GitHub a second timestamp. Then the
 * states the run ended with go back to the release. A run made again
 * over the same sets, after a failed upload, logs nothing twice.
 *
 * The data are main's: the exclusions file and the ground truth, and the
 * GCAT snapshot, refreshed once a day. The places are the environment's
 * where it names them: the Archive (`RENDEZVOUS_ARCHIVE`, the run's own
 * directory is `live/` under it), the frozen checkout
 * (`RENDEZVOUS_FROZEN`), the branch's worktree (`RENDEZVOUS_LIVE`) and the
 * published branch's (`RENDEZVOUS_PUBLISHED`), so the workflow runs the
 * same code over its own checkouts. Any failure stops the run with a
 * non-zero exit and a line in `live.log`, and the branch's files are put
 * back as they were, so a run commits whole or not at all.
 */

const ROOT = resolve(import.meta.dirname, "../..");

export interface Places {
  root: string;
  frozen: string;
  /** The worktree of the `live` branch. */
  branch: string;
  /** The worktree of the `published` branch. */
  published: string;
  archive: string;
  /** The run's own directory under the Archive: states, GCAT, pulls, ledger, log. */
  home: string;
}

export function placesOf(env: NodeJS.ProcessEnv = process.env): Places {
  const archive = resolve(env.RENDEZVOUS_ARCHIVE ?? resolve(ROOT, "../rendezvous-archive"));
  return {
    root: ROOT,
    frozen: frozenDirOf(env),
    branch: resolve(env.RENDEZVOUS_LIVE ?? resolve(ROOT, "../rendezvous-live")),
    published: resolve(env.RENDEZVOUS_PUBLISHED ?? resolve(ROOT, "../rendezvous-published")),
    archive,
    home: join(archive, "live"),
  };
}

export const STATES_FILE = "states.json.gz";
export const PROVENANCE_FILE = "states.provenance.txt";
export const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

/** Whether a worktree's branch has an upstream to pull from and push to. */
function hasUpstream(dir: string): boolean {
  try { git(dir, "rev-parse", "--abbrev-ref", "@{u}"); return true; } catch { return false; }
}

/** The branch's worktree, checked and brought up to date. */
export function checkBranch(dir: string, branch: string, pull = true): void {
  if (!existsSync(dir)) throw new Error(`no worktree of the ${branch} branch at ${dir}: git worktree add ${dir} ${branch}`);
  if (git(dir, "symbolic-ref", "--short", "HEAD") !== branch) throw new Error(`${dir} is not on the ${branch} branch`);
  if (git(dir, "status", "--porcelain") !== "") throw new Error(`the ${branch} worktree ${dir} has changes: commit or remove them first`);
  if (pull && hasUpstream(dir)) git(dir, "pull", "-q", "--ff-only");
}

/** Appends the verdicts and the run's line, commits, and pushes where the branch has an upstream; the files are put back if anything before the commit fails. */
export function commitRun(branch: string, fresh: readonly LoggedVerdict[], line: RunLine, title: string, body: string): string {
  const files = [VERDICTS_FILE, RUNS_FILE].map((name) => join(branch, name));
  const before = files.map((path) => (existsSync(path) ? readFileSync(path, "utf8") : null));
  const ended = (text: string | null): string => (text === null || text === "" || text.endsWith("\n") ? (text ?? "") : `${text}\n`);
  try {
    writeFileSync(files[0]!, `${ended(before[0]!)}${jsonl(fresh)}`);
    writeFileSync(files[1]!, `${ended(before[1]!)}${jsonl([line])}`);
    git(branch, "add", VERDICTS_FILE, RUNS_FILE);
    git(branch, "commit", "-q", "-m", title, "-m", body);
  } catch (error) {
    files.forEach((path, i) => (before[i] === null ? rmSync(path, { force: true }) : writeFileSync(path, before[i]!)));
    try { git(branch, "reset", "-q"); } catch { /* the files are back as they were */ }
    throw error;
  }
  const commit = git(branch, "rev-parse", "HEAD");
  if (hasUpstream(branch)) git(branch, "push", "-q");
  return commit;
}

/** The states as text, gzipped, with their hash; written to the run's directory with a provenance line. */
export function writeStates(home: string, frozen: Frozen, states: Parameters<Frozen["serialiseStates"]>[0], provenance: string): string {
  const packed = gzipSync(frozen.serialiseStates(states));
  const sha = sha256(packed);
  writeFileSync(join(home, `${STATES_FILE}.writing`), packed);
  renameSync(join(home, `${STATES_FILE}.writing`), join(home, STATES_FILE));
  writeFileSync(join(home, PROVENANCE_FILE), `${provenance} sha256 ${sha}.\n`);
  return sha;
}

/** The sets of the rows the catalogue gave, in publication order; a row the reader refuses is counted, not read. */
export function setsOf(frozen: Frozen, rows: Parameters<Frozen["fromRow"]>[0][]): { sets: ElementSet[]; unreadable: number } {
  const sets: ElementSet[] = [];
  let unreadable = 0;
  for (const row of rows) {
    try { sets.push(frozen.fromRow(row)); } catch { unreadable++; }
  }
  sets.sort((a, b) => (a.createdMs ?? a.epochMs) - (b.createdMs ?? b.epochMs) || a.epochMs - b.epochMs);
  return { sets, unreadable };
}

export interface RunTools {
  pull: (home: string, sinceMs: number, untilMs: number) => Promise<{ rows: Parameters<Frozen["fromRow"]>[0][]; requests: number }>;
  uploadData: (home: string) => void;
  runUrl: string | null;
}

/** The tools of a real run; with `--local`, the states stay on the machine (no upload), for a trial. */
const defaultTools = (): RunTools => ({
  pull: (home, sinceMs, untilMs) => pullSince(new SpaceTrack(credentialsFromEnv(), home), home, sinceMs, untilMs),
  uploadData: process.argv.includes("--local") ? (home) => console.log(`--local: the states stay at ${home}, not uploaded`) : (home) => upload(home),
  runUrl: runUrlOf(process.env),
});

/** The hour's run, as the module's head says, over the places given. */
export async function hourly(places: Places, started: number, tools: RunTools = defaultTools()): Promise<{ line: RunLine; commit: string; fresh: Verdict[] }> {
  const { root, frozen: frozenDir, branch, home } = places;
  const tagged = checkFrozen(root, frozenDir);
  const frozen = await loadFrozen(frozenDir);
  checkBranch(branch, BRANCH);

  const runs = readJsonl<RunLine>(join(branch, RUNS_FILE));
  const last = runs[runs.length - 1];
  if (last === undefined) throw new Error(`no run logged in ${join(branch, RUNS_FILE)}: the seed makes the first line (npm run live:seed)`);
  const statesPath = join(home, STATES_FILE);
  if (!existsSync(statesPath)) throw new Error(`no states at ${statesPath}: download them first (npm run live:data -- download)`);
  const packed = readFileSync(statesPath);
  if (sha256(packed) !== last.statesSha256) console.warn(`the states at ${statesPath} are not the ones the last run logged (${last.statesSha256.slice(0, 12)}): a run's upload failed; its sets are read again and its verdicts logged once`);
  const states = frozen.reviveStates(gunzipSync(packed).toString("utf8"));

  const today = new Date(started).toISOString().slice(0, 10);
  const gcat = await ensureGcat(join(home, "gcat"), today);
  const catalogue = readCatalogue(join(home, "gcat", "satcat.tsv"), join(home, "gcat", "orgs.tsv"));
  const exclusions = frozen.readExclusions(JSON.parse(readFileSync(join(root, "data/exclusions.json"), "utf8")));

  const sinceMs = Date.parse(last.setsThrough);
  if (!Number.isFinite(sinceMs)) throw new Error(`the last run's setsThrough is not an instant: ${last.setsThrough}`);
  const { rows, requests } = await tools.pull(home, sinceMs, started);
  const { sets, unreadable } = setsOf(frozen, rows);
  if (unreadable > 0) console.warn(`${unreadable} rows the reader refused`);
  const out = frozen.runDetector({ sets, body: catalogue.body, exclusions }, states);
  const throughMs = latestCreated(rows) ?? sinceMs;

  const logged = readJsonl<LoggedVerdict>(join(branch, VERDICTS_FILE)).map(unlogged);
  const fresh = newVerdicts(logged, out.verdicts);
  const now = new Date().toISOString();
  const packedStates = gzipSync(frozen.serialiseStates(out.states));
  const statesSha256 = sha256(packedStates);
  const line: RunLine = {
    kind: "run",
    startedAt: new Date(started).toISOString(),
    durationSeconds: Math.round((Date.now() - started) / 1000),
    frozen: tagged,
    detector: FROZEN_DETECTOR,
    since: new Date(sinceMs).toISOString(),
    setsThrough: new Date(throughMs).toISOString(),
    requests,
    sets: sets.length,
    leoSets: sets.filter((s) => frozen.isLeo(s)).length,
    verdicts: out.verdicts.length,
    newVerdicts: fresh.length,
    holdsRaised: fresh.filter((v) => v.stage === "beside" && v.state === "raised").length,
    holdsConfirmed: fresh.filter((v) => v.stage === "beside" && v.state === "confirmed").length,
    statesSha256,
    gcatFetchedOn: gcat.stamp.fetchedOn,
    node: process.version,
    versions: installedVersions(frozenDir),
    runUrl: tools.runUrl,
  };
  const body = `The frozen detector ${FROZEN_DETECTOR} (${tagged.slice(0, 7)}) read ${line.sets} sets published from ${line.since} to ${line.setsThrough}, ${line.leoSets} of them in low orbit, and raised ${line.verdicts} verdicts, ${fresh.length} new to the log: ${line.holdsRaised} holds raised, ${line.holdsConfirmed} confirmed. The run made ${requests} requests to the catalogue and took ${line.durationSeconds} seconds.${tools.runUrl === null ? "" : ` It ran as ${tools.runUrl}.`}`;
  const commit = commitRun(branch, fresh.map((v) => ({ ...v, loggedAt: now, runUrl: tools.runUrl })), line, `Verdicts through ${line.setsThrough.slice(0, 16)}Z`, body);

  // The states, only once the verdicts are committed: a failed upload makes the next run read these sets again and log nothing twice.
  writeFileSync(join(home, `${STATES_FILE}.writing`), packedStates);
  renameSync(join(home, `${STATES_FILE}.writing`), statesPath);
  writeFileSync(join(home, PROVENANCE_FILE), `${STATES_FILE} is the detector ${FROZEN_DETECTOR}'s states after the sets published through ${line.setsThrough}, written on ${now} by the live run from the frozen commit ${tagged}${tools.runUrl === null ? "" : ` as ${tools.runUrl}`}, logged as commit ${commit} of the ${BRANCH} branch. sha256 ${statesSha256}.\n`);
  tools.uploadData(home);
  return { line, commit, fresh };
}

/** A lock under the run's directory, so two runs never overlap; one left by a run that died is taken over. */
export function acquireLock(home: string): string {
  const path = join(home, "run.lock");
  if (existsSync(path)) {
    const pid = Number(readFileSync(path, "utf8").trim());
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { alive = false; }
    if (alive) throw new Error(`another run (process ${pid}) holds ${path}`);
    unlinkSync(path);
  }
  writeFileSync(path, `${process.pid}\n`, { flag: "wx" });
  return path;
}

async function main(): Promise<void> {
  const started = Date.now();
  const places = placesOf();
  mkdirSync(places.home, { recursive: true });
  const log = (text: string): void => appendFileSync(join(places.home, "live.log"), `${new Date().toISOString()} ${text}\n`);
  let lock: string | null = null;
  try {
    lock = acquireLock(places.home);
    const { line, commit, fresh } = await hourly(places, started);
    const summary = `ok ${line.startedAt}: ${line.sets} sets through ${line.setsThrough}, ${line.verdicts} verdicts, ${fresh.length} new, ${line.holdsRaised} holds raised, ${line.holdsConfirmed} confirmed, ${line.requests} requests, ${line.durationSeconds} s, committed ${commit.slice(0, 7)}`;
    log(summary);
    console.log(`\n${summary}`);
    for (const v of fresh) if (v.stage === "beside" || v.stage === "left") console.log(`  ${new Date(v.at).toISOString()} ${v.stage} ${v.state} ${v.chaser} beside ${v.target}${v.exclusion === null ? "" : ` (${v.exclusion})`}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`FAILED ${message.replace(/\s+/g, " ")}`);
    console.error(`\nFAILED: ${message}`);
    process.exitCode = 1;
  } finally {
    if (lock !== null) rmSync(lock, { force: true });
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("live/run.ts")) await main();
