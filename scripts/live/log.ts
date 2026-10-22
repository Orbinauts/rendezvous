import { existsSync, readFileSync } from "node:fs";
import type { Verdict } from "../../src/detector.ts";

/**
 * The live run's record on the orphan branch `live`: `verdicts.jsonl`,
 * every verdict the frozen detector raised since the seed, one a line,
 * with the instant it was logged, and `runs.jsonl`, a line per run naming
 * what it read and what it found. The branch is committed and pushed by
 * each run, so a commit's time is the proof of when a verdict was known,
 * and the run's log on GitHub a second, independent timestamp. The last
 * line of `runs.jsonl` is also the cursor: `setsThrough`, the publication
 * time the next run pulls from.
 */

export const BRANCH = "live";
export const VERDICTS_FILE = "verdicts.jsonl";
export const RUNS_FILE = "runs.jsonl";

export interface LoggedVerdict extends Verdict {
  /** When the run logged it, ISO. */
  loggedAt: string;
  /** The GitHub Actions run that logged it, or null for one logged elsewhere (the seed, a run by hand). */
  runUrl: string | null;
}

/** One run's line in `runs.jsonl`. */
export interface RunLine {
  kind: "seed" | "run";
  startedAt: string;
  durationSeconds: number;
  /** The frozen commit the detector ran from. */
  frozen: string;
  detector: string;
  /** The publication time the run read sets from (exclusive of what the previous run read, by its own boundary set). */
  since: string;
  /** The publication time the run read sets through: the next run's `since`. */
  setsThrough: string;
  /** Requests made to the catalogue. */
  requests: number;
  /** Sets read, and of them the low-orbit ones the detector reads. */
  sets: number;
  leoSets: number;
  /** Verdicts the detector raised this run, and how many were new to the log. */
  verdicts: number;
  newVerdicts: number;
  holdsRaised: number;
  holdsConfirmed: number;
  /** The states the run ended with, as written to `states.json.gz`. */
  statesSha256: string;
  /** The GCAT snapshot's day. */
  gcatFetchedOn: string | null;
  node: string;
  versions: Record<string, string | null>;
  runUrl: string | null;
}

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

export const jsonl = (lines: readonly unknown[]): string => lines.map((line) => `${JSON.stringify(line)}\n`).join("");

/** A verdict's identity in the log: the pair, the stage, the state and the epoch it was read at. */
export const verdictKey = (v: Verdict): string => `${v.chaser}-${v.target}-${v.stage}-${v.state}-${v.at}`;

/** The verdicts not yet in the log, in order: a run made again over the same sets (after a failed upload of its states) logs nothing twice. */
export function newVerdicts(logged: readonly Verdict[], found: readonly Verdict[]): Verdict[] {
  const keys = new Set(logged.map(verdictKey));
  const fresh: Verdict[] = [];
  for (const v of found) {
    const key = verdictKey(v);
    if (keys.has(key)) continue;
    keys.add(key);
    fresh.push(v);
  }
  return fresh;
}

/** The logged verdicts as the detector's, for the published files. */
export const unlogged = ({ loggedAt: _loggedAt, runUrl: _runUrl, ...v }: LoggedVerdict): Verdict => v;
