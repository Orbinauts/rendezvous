import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { reviveStates } from "../../src/states.ts";
import { writePublished } from "../published/cli.ts";
import { git } from "./git.ts";
import { runUrlOf } from "./github.ts";
import { readJsonl, RUNS_FILE, unlogged, VERDICTS_FILE, type LoggedVerdict, type RunLine } from "./log.ts";
import { checkBranch, placesOf, STATES_FILE, type Places } from "./run.ts";

/**
 * The live run's publishing, after the run has logged and pushed its
 * verdicts: `npm run live:publish`. The whole log of the `live` branch
 * (every verdict since the seed) is selected into the published files
 * against main's ground truth, written into the worktree of the
 * `published` branch (`v1/`), committed there and pushed. It reads
 * nothing the run writes after it and writes nothing the run reads, so a
 * failure here leaves the verdicts committed. A commit that could not be
 * pushed is lost with the runner, and the next run rebuilds the files on
 * the remote's branch from the whole log, so the list catches up.
 */

export const PUBLISHED_BRANCH = "published";
export const PUBLISHED_DIR = "v1";

/** Writes `v1/`, commits and pushes it; the worktree is put back at its last commit if anything before the commit fails. */
function commitPublished(checkout: string, write: () => string, message: (summary: string) => { title: string; body: string }): { summary: string; commit: string } {
  let summary: string;
  try {
    summary = write();
    const { title, body } = message(summary);
    git(checkout, "add", "--all", "--", PUBLISHED_DIR);
    git(checkout, "commit", "-q", "-m", title, "-m", body);
  } catch (error) {
    try {
      git(checkout, "reset", "-q", "--hard", "HEAD");
      git(checkout, "clean", "-q", "-fd", "--", PUBLISHED_DIR);
    } catch { /* a worktree left changed is refused by the next run's check */ }
    throw error;
  }
  const commit = git(checkout, "rev-parse", "HEAD");
  let upstream = true;
  try { git(checkout, "rev-parse", "--abbrev-ref", "@{u}"); } catch { upstream = false; }
  if (upstream) git(checkout, "push", "-q");
  return { summary, commit };
}

/** Publishes the whole log into the `published` worktree, commits and pushes it, and says what it did. */
export function publishLive(places: Places, now: number, context: { runUrl: string | null } = { runUrl: runUrlOf(process.env) }): { summary: string; commit: string } {
  const { branch, published, home, root } = places;
  checkBranch(published, PUBLISHED_BRANCH);
  const runs = readJsonl<RunLine>(join(branch, RUNS_FILE));
  const last = runs[runs.length - 1];
  if (last === undefined) throw new Error(`no run logged in ${join(branch, RUNS_FILE)}: nothing to publish`);
  const verdicts = readJsonl<LoggedVerdict>(join(branch, VERDICTS_FILE)).map(unlogged);
  const statesPath = join(home, STATES_FILE);
  if (!existsSync(statesPath)) throw new Error(`no states at ${statesPath}: the designators are read from them`);
  const states = reviveStates(gunzipSync(readFileSync(statesPath)).toString("utf8"));
  const designatorOf = (n: number): string | null => states.objects.get(n)?.latest.designator ?? null;
  return commitPublished(
    published,
    () => writePublished({ verdicts, designatorOf, gcat: join(home, "gcat"), out: published, setsThrough: last.setsThrough, now, root }),
    (summary) => ({
      title: `Published rendezvous through ${last.setsThrough.slice(0, 16)}Z`,
      body: `The frozen detector's verdicts logged on the ${"live"} branch through ${last.setsThrough}, selected against main's ground truth: ${summary}.${context.runUrl === null ? "" : ` It ran as ${context.runUrl}.`}`,
    }),
  );
}

function main(): void {
  const { summary, commit } = publishLive(placesOf(), Date.now());
  console.log(`${summary}; committed ${commit.slice(0, 7)} to ${PUBLISHED_BRANCH}`);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("live/publish.ts")) {
  try { main(); } catch (error) {
    console.error(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
