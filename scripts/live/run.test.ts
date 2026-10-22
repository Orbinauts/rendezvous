import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as lib from "../../src/index.ts";
import { git } from "./git.ts";
import { readJsonl, RUNS_FILE, VERDICTS_FILE, type LoggedVerdict, type RunLine } from "./log.ts";
import { checkBranch, commitRun, setsOf } from "./run.ts";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function repo(branch: string): string {
  const dir = mkdtempSync(join(tmpdir(), "rendezvous-live-"));
  dirs.push(dir);
  execFileSync("git", ["init", "-q", "-b", branch, dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.invalid"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "test"]);
  return dir;
}

const line = (over: Partial<RunLine>): RunLine => ({ kind: "run", startedAt: "2026-10-22T10:00:00.000Z", durationSeconds: 1, frozen: "f", detector: "beside-v1", since: "2026-10-22T09:00:00.000Z", setsThrough: "2026-10-22T10:00:00.000Z", requests: 1, sets: 10, leoSets: 8, verdicts: 1, newVerdicts: 1, holdsRaised: 0, holdsConfirmed: 0, statesSha256: "s", gcatFetchedOn: "2026-10-22", node: "v24", versions: {}, runUrl: null, ...over });
const logged: LoggedVerdict = { stage: "plane", state: "raised", chaser: 1, target: 2, at: 1, publishedAt: 2, exclusion: null, evidence: { thetaDeg: 0, nodeDeg: 0, inclinationDeg: 97, deltaAKm: 0, deltaE: 0, distanceKm: null, distanceLaterKm: null, nearestKm: null }, loggedAt: "2026-10-22T10:00:00.000Z", runUrl: null };

describe("the live run's commit", () => {
  it("appends the verdicts and the run's line, commits on the live branch, and refuses a worktree on another branch or with changes", () => {
    const dir = repo("live");
    checkBranch(dir, "live");
    const commit = commitRun(dir, [logged], line({}), "Verdicts through 2026-10-22T10:00Z", "body");
    expect(git(dir, "rev-parse", "HEAD")).toBe(commit);
    commitRun(dir, [], line({ setsThrough: "2026-10-22T11:00:00.000Z" }), "Verdicts through 2026-10-22T11:00Z", "body");
    expect(readJsonl<LoggedVerdict>(join(dir, VERDICTS_FILE))).toEqual([logged]);
    expect(readJsonl<RunLine>(join(dir, RUNS_FILE)).map((l) => l.setsThrough)).toEqual(["2026-10-22T10:00:00.000Z", "2026-10-22T11:00:00.000Z"]);
    expect(readFileSync(join(dir, VERDICTS_FILE), "utf8").endsWith("\n")).toBe(true);
    expect(() => checkBranch(dir, "published")).toThrow(/not on the published branch/);
    expect(() => checkBranch(repo("main"), "live")).toThrow(/not on the live branch/);
  });
  it("reads the rows into sets in publication order and counts a row it cannot read", () => {
    const row = (n: string, created: string): lib.OmmRow => ({ NORAD_CAT_ID: n, OBJECT_ID: "2024-001A", EPOCH: "2026-10-22T08:00:00", MEAN_MOTION: "15.1", ECCENTRICITY: "0.001", INCLINATION: "97.4", RA_OF_ASC_NODE: "10", ARG_OF_PERICENTER: "20", MEAN_ANOMALY: "30", BSTAR: "0.0001", MEAN_MOTION_DOT: "0", MEAN_MOTION_DDOT: "0", ELEMENT_SET_NO: "999", REV_AT_EPOCH: "100", CREATION_DATE: created, GP_ID: "1" });
    const { sets, unreadable } = setsOf(lib, [row("2", "2026-10-22 10:30:00"), row("1", "2026-10-22 10:10:00"), { ...row("3", "2026-10-22 10:20:00"), MEAN_MOTION: "x" }]);
    expect(sets.map((s) => s.number)).toEqual([1, 2]);
    expect(unreadable).toBe(1);
  });
});
