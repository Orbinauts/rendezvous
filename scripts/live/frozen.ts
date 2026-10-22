import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { git } from "./git.ts";

/**
 * The frozen detector the live run tests: the tag `frozen-beside-v1`, a
 * checkout of it in its own worktree (`RENDEZVOUS_FROZEN`, by default
 * `../rendezvous-frozen`), loaded from there and never from this branch,
 * so that work on main never changes what is being tested
 * ([docs/decisions/0006](../../docs/decisions/0006-the-live-run-is-hourly-from-a-frozen-tag.md)).
 * The tag must still name the commit it was made at: a tag moved is
 * refused, not followed. The worktree's runtime dependency is installed at
 * the version the detector was scored with (`FROZEN_PINS`, checked), with
 * `npm install --no-save`, so the checkout stays the tag as committed.
 */

export const FROZEN_TAG = "frozen-beside-v1";
/** The commit the tag was made at, the detector scored there (kpi/latest.json); the tag naming any other is refused. */
export const FROZEN_COMMIT = "b15c0d3ce59b4236e66b65bfc3adb15a690a08d1";
export const FROZEN_DETECTOR = "beside-v1";
/** The runtime dependencies of the frozen detector, at the versions it was scored with. */
export const FROZEN_PINS: Record<string, string> = { "satellite.js": "7.1.0" };

/** The library as the frozen checkout exports it (`src/index.ts` there); the shapes are this branch's, which the tag's are a version of. */
export type Frozen = typeof import("../../src/index.ts");

const ROOT = resolve(import.meta.dirname, "../..");

export const frozenDirOf = (env: NodeJS.ProcessEnv = process.env): string => resolve(env.RENDEZVOUS_FROZEN ?? resolve(ROOT, "../rendezvous-frozen"));

/** Refuses a tag that no longer names the commit the test froze. */
export function checkTagged(tagged: string, frozenCommit = FROZEN_COMMIT): void {
  if (tagged !== frozenCommit) throw new Error(`the tag ${FROZEN_TAG} names ${tagged}, not ${frozenCommit}, the commit the test froze: a moved tag is not the frozen detector`);
}

/** The versions installed under a checkout, by package, for the pins; a package not installed is null. */
export function installedVersions(dir: string, pins: Record<string, string> = FROZEN_PINS): Record<string, string | null> {
  const versions: Record<string, string | null> = {};
  for (const name of Object.keys(pins)) {
    const manifest = join(dir, "node_modules", name, "package.json");
    versions[name] = existsSync(manifest) ? ((JSON.parse(readFileSync(manifest, "utf8")) as { version: string }).version ?? null) : null;
  }
  return versions;
}

/** The pins' versions against the installed ones; the first difference, as a message, or null. */
export function pinsMismatch(installed: Record<string, string | null>, pins: Record<string, string> = FROZEN_PINS): string | null {
  for (const [name, version] of Object.entries(pins)) if (installed[name] !== version) return `${name} is ${installed[name] ?? "not installed"} in the frozen worktree, not ${version} (npm install --no-save --ignore-scripts ${name}@${version})`;
  return null;
}

/**
 * Checks the frozen worktree is the tag, clean, with its pins installed,
 * and that the tag still names the frozen commit (read in `root`, this
 * repository); returns the commit.
 */
export function checkFrozen(root: string, frozen: string, frozenCommit = FROZEN_COMMIT): string {
  if (!existsSync(frozen)) throw new Error(`no frozen worktree at ${frozen}: git worktree add --detach ${frozen} ${FROZEN_TAG}`);
  const tagged = git(root, "rev-parse", `${FROZEN_TAG}^{commit}`);
  checkTagged(tagged, frozenCommit);
  const head = git(frozen, "rev-parse", "HEAD");
  if (head !== tagged) throw new Error(`the frozen worktree ${frozen} is at ${head}, not at ${FROZEN_TAG} (${tagged})`);
  if (git(frozen, "status", "--porcelain") !== "") throw new Error(`the frozen worktree ${frozen} has changes: it must be the tag as committed`);
  const mismatch = pinsMismatch(installedVersions(frozen));
  if (mismatch !== null) throw new Error(mismatch);
  return tagged;
}

/** The frozen checkout's library, loaded from its own files; its `DETECTOR_NAME` must be the frozen detector's. */
export async function loadFrozen(frozen: string): Promise<Frozen> {
  const lib = (await import(pathToFileURL(join(frozen, "src", "index.ts")).href)) as Frozen;
  if (lib.DETECTOR_NAME !== FROZEN_DETECTOR) throw new Error(`the frozen worktree's detector is ${lib.DETECTOR_NAME}, not ${FROZEN_DETECTOR}`);
  return lib;
}
