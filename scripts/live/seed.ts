import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { archiveHome, pullDay } from "../archive/pull-days.ts";
import { credentialsFromEnv, SpaceTrack } from "../archive/space-track.ts";
import { replaySpan } from "../replay/run.ts";
import { dayAfter, dayOf } from "../replay/sources.ts";
import { DAY_MS } from "../../src/elements.ts";
import { checkFrozen, FROZEN_DETECTOR, installedVersions, loadFrozen } from "./frozen.ts";
import { git } from "./git.ts";
import { BRANCH, jsonl, RUNS_FILE, VERDICTS_FILE, type LoggedVerdict, type RunLine } from "./log.ts";
import { publishLive, PUBLISHED_BRANCH } from "./publish.ts";
import { placesOf, PROVENANCE_FILE, sha256, STATES_FILE } from "./run.ts";

/**
 * The seed of the live run, made once on the maintainer's machine:
 * `npm run live:seed -- --from <day> --gcat <dir> [--through <day>]`. It
 * replays the local Archive from a day through yesterday with the frozen
 * detector, the last three days pulled afresh so every set published
 * before the cut is read, and makes the two orphan branches' worktrees
 * where they are missing: the `live` branch with every verdict of the
 * replay logged as the seed's and one run line whose `setsThrough` is
 * midnight after the cut, from which the first hourly run pulls; and the
 * `published` branch with the files selected from that log. The states
 * and the GCAT snapshot go to the run's directory, for
 * `npm run live:data -- upload` to put on the release. Nothing is pushed:
 * the seed prints what to push.
 */

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || process.argv[i + 1] === undefined) { if (fallback !== undefined) return fallback; throw new Error(`--${name} needed`); }
  return process.argv[i + 1]!;
}

/** The days pulled afresh at the seed: the cut, the two before it and the one after, so the sets published before midnight after the cut are all held. */
export const freshDays = (through: string): string[] => [-2, -1, 0, 1].map((d) => dayOf(Date.parse(`${through}T00:00:00Z`) + d * DAY_MS));

function ensureWorktree(root: string, dir: string, branch: string): void {
  if (existsSync(dir)) return;
  const exists = git(root, "branch", "--list", branch) !== "";
  if (exists) execFileSync("git", ["worktree", "add", dir, branch], { cwd: root, stdio: "inherit" });
  else execFileSync("git", ["worktree", "add", "--orphan", "-b", branch, dir], { cwd: root, stdio: "inherit" });
}

async function main(): Promise<void> {
  const started = Date.now();
  const from = arg("from");
  const gcat = resolve(arg("gcat"));
  const through = arg("through", dayOf(started - DAY_MS));
  const places = placesOf();
  const { root, frozen: frozenDir, branch, published, archive, home } = places;
  const tagged = checkFrozen(root, frozenDir);
  const frozen = await loadFrozen(frozenDir);
  mkdirSync(home, { recursive: true });

  ensureWorktree(root, branch, BRANCH);
  ensureWorktree(root, published, PUBLISHED_BRANCH);
  if (git(branch, "symbolic-ref", "--short", "HEAD") !== BRANCH) throw new Error(`${branch} is not on the ${BRANCH} branch`);
  if (existsSync(join(branch, RUNS_FILE)) && readFileSync(join(branch, RUNS_FILE), "utf8").trim() !== "") throw new Error(`${join(branch, RUNS_FILE)} already has runs: the seed is made once`);

  // The last days afresh, into the seed's own Archive, read before the others.
  const seedArchive = join(home, "seed");
  const client = new SpaceTrack(credentialsFromEnv(), home);
  for (const day of freshDays(through)) {
    const n = await pullDay(client, seedArchive, day, true);
    console.log(`${day}: ${n} sets pulled afresh`);
  }
  const archives = [seedArchive, archiveHome(), resolve(root, "../breakups-archive")].filter((a, i, all) => all.indexOf(a) === i && existsSync(a));
  const result = replaySpan(from, through, gcat, archives, (line) => console.log(line), { runDetector: frozen.runDetector, newStates: frozen.newStates });
  if (result.missingDays.length > 0) throw new Error(`days with no sets in any Archive: ${result.missingDays.join(", ")}`);

  const now = new Date().toISOString();
  const setsThrough = `${dayAfter(through)}T00:00:00.000Z`;
  const packed = gzipSync(frozen.serialiseStates(result.states));
  const statesSha256 = sha256(packed);
  const line: RunLine = {
    kind: "seed", startedAt: new Date(started).toISOString(), durationSeconds: Math.round((Date.now() - started) / 1000), frozen: tagged, detector: FROZEN_DETECTOR,
    since: `${from}T00:00:00.000Z`, setsThrough, requests: freshDays(through).length,
    sets: 0, leoSets: 0, verdicts: result.verdicts.length, newVerdicts: result.verdicts.length,
    holdsRaised: result.verdicts.filter((v) => v.stage === "beside" && v.state === "raised").length,
    holdsConfirmed: result.verdicts.filter((v) => v.stage === "beside" && v.state === "confirmed").length,
    statesSha256, gcatFetchedOn: dayOf(started), node: process.version, versions: installedVersions(frozenDir), runUrl: null,
  };
  const logged: LoggedVerdict[] = result.verdicts.map((v) => ({ ...v, loggedAt: now, runUrl: null }));
  writeFileSync(join(branch, VERDICTS_FILE), jsonl(logged));
  writeFileSync(join(branch, RUNS_FILE), jsonl([line]));
  writeFileSync(join(branch, "README.md"), `# The live run's log\n\nEvery verdict the frozen detector raised, one a line in \`verdicts.jsonl\`, and a line per run in \`runs.jsonl\`, committed by each hourly run of Orbinauts/rendezvous (its \`docs/live.md\`). The first lines are the seed: the local Archive replayed from ${from} through ${through} on ${now.slice(0, 10)}. Written by the runs, never by hand.\n`);
  git(branch, "add", VERDICTS_FILE, RUNS_FILE, "README.md");
  git(branch, "commit", "-q", "-m", `Seed: verdicts from ${from} through ${through}`, "-m", `The frozen detector ${FROZEN_DETECTOR} (${tagged.slice(0, 7)}) replayed the Archive from ${from} through ${through}, ${result.verdicts.length} verdicts, ${line.holdsRaised} holds raised. The first hourly run pulls the sets published from ${setsThrough}.`);
  const commit = git(branch, "rev-parse", "HEAD");

  writeFileSync(join(home, STATES_FILE), packed);
  writeFileSync(join(home, PROVENANCE_FILE), `${STATES_FILE} is the detector ${FROZEN_DETECTOR}'s states after the sets published through ${setsThrough}, written on ${now} by the seed from the frozen commit ${tagged}, logged as commit ${commit} of the ${BRANCH} branch. sha256 ${statesSha256}.\n`);
  mkdirSync(join(home, "gcat"), { recursive: true });
  for (const name of ["satcat.tsv", "orgs.tsv"]) copyFileSync(join(gcat, name), join(home, "gcat", name));
  writeFileSync(join(home, "gcat", "gcat.json"), `${JSON.stringify({ fetchedOn: dayOf(started) })}\n`);
  rmSync(join(home, "seed", "scratch"), { recursive: true, force: true });

  const { summary, commit: publishedCommit } = publishLive(places, Date.now(), { runUrl: null });
  console.log(`\nseeded: ${result.verdicts.length} verdicts through ${setsThrough}, committed ${commit.slice(0, 7)} to ${BRANCH}; ${summary}, committed ${publishedCommit.slice(0, 7)} to ${PUBLISHED_BRANCH}`);
  console.log(`\nNext, by hand:\n  git -C ${branch} push -u origin ${BRANCH}\n  git -C ${published} push -u origin ${PUBLISHED_BRANCH}\n  npm run live:data -- upload        (the states and the GCAT snapshot to the release ${"live-data"})\n  git push origin main ${"frozen-beside-v1"}\n  gh secret set SPACETRACK_IDENTITY; gh secret set SPACETRACK_PASSWORD\nThe Archive the seed read: ${archive}; the run's directory: ${home}.`);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("live/seed.ts")) {
  try { await main(); } catch (error) {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
