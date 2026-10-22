import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

/**
 * The live run's own data between runs, kept as assets of the release
 * `live-data` of this repository, since the scheduled workflow starts
 * every hour on an empty runner: the frozen detector's states at the end
 * of the last run (`states.json.gz`, the next run starts from them) with
 * a text saying what made them (`states.provenance.txt`), the GCAT
 * snapshot (`gcat-satcat.tsv.gz`, `gcat-orgs.tsv.gz`, `gcat.json`), and
 * `manifest.json`, naming each asset's size and SHA-256.
 *
 * `npm run live:data -- download` fetches the manifest and every asset it
 * names into the run's directory (`<archive>/live`), verifying each hash;
 * `npm run live:data -- upload` uploads, with the GitHub CLI and
 * `--clobber`, every asset whose hash the release's manifest does not
 * already name, then the manifest, creating the release if need be. It is
 * how the seed first fills the release and how each run keeps it. Both
 * go through `gh` (authenticated, `GH_REPO` naming the repository), which
 * reads an asset by its id: the release's public download links may serve
 * a replaced asset's old bytes for a while.
 */

export const DATA_TAG = "live-data";
const repository = (): string => process.env.GH_REPO ?? "Orbinauts/rendezvous";

/** The assets, by name in the release, and the file each is under the run's directory; an uploaded asset takes its file's name, so the packed GCAT tables are written under the asset's name. */
export const ASSETS: Record<string, string> = {
  "states.json.gz": "states.json.gz",
  "states.provenance.txt": "states.provenance.txt",
  "gcat-satcat.tsv.gz": "gcat-satcat.tsv.gz",
  "gcat-orgs.tsv.gz": "gcat-orgs.tsv.gz",
  "gcat.json": "gcat/gcat.json",
};

export interface DataAsset {
  bytes: number;
  sha256: string;
}

export interface DataManifest {
  format: 1;
  tag: typeof DATA_TAG;
  assets: Record<string, DataAsset>;
  writtenAt: string;
}

export const sha256File = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

/** The manifest of the files present under the run's directory. */
export function manifestOf(home: string, now: number): DataManifest {
  const assets: Record<string, DataAsset> = {};
  for (const [name, file] of Object.entries(ASSETS)) {
    const path = join(home, file);
    if (!existsSync(path)) continue;
    assets[name] = { bytes: statSync(path).size, sha256: sha256File(path) };
  }
  return { format: 1, tag: DATA_TAG, assets, writtenAt: new Date(now).toISOString() };
}

/** The assets to upload: those the release's manifest names with another hash, or not at all. */
export function toUpload(local: DataManifest, released: DataManifest | null): string[] {
  return Object.entries(local.assets)
    .filter(([name, asset]) => released?.assets[name]?.sha256 !== asset.sha256)
    .map(([name]) => name);
}

const gh = (args: string[]): string => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });

function releasedManifest(): DataManifest | null {
  const dir = join(process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? "/tmp", `rendezvous-${DATA_TAG}-manifest`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    gh(["release", "download", DATA_TAG, "--repo", repository(), "--pattern", "manifest.json", "--dir", dir, "--clobber"]);
  } catch {
    return null;
  }
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as DataManifest;
}

/** The GCAT tables gzipped beside themselves for the upload, and the gzipped ones unpacked after a download. */
function packGcat(home: string): void {
  for (const name of ["satcat.tsv", "orgs.tsv"]) {
    const plain = join(home, "gcat", name);
    if (existsSync(plain)) writeFileSync(join(home, `gcat-${name}.gz`), gzipSync(readFileSync(plain)));
  }
}
function unpackGcat(home: string): void {
  for (const name of ["satcat.tsv", "orgs.tsv"]) {
    const packed = join(home, `gcat-${name}.gz`);
    if (existsSync(packed)) writeFileSync(join(home, "gcat", name), gunzipSync(readFileSync(packed)));
  }
}

export function download(home: string): void {
  const released = releasedManifest();
  if (released === null) throw new Error(`no release ${DATA_TAG} with a manifest in ${repository()}: the seed makes it (npm run live:seed, then npm run live:data -- upload)`);
  mkdirSync(join(home, "gcat"), { recursive: true });
  for (const [name, asset] of Object.entries(released.assets)) {
    const file = ASSETS[name];
    if (file === undefined) { console.warn(`${name}: not an asset this version reads; left`); continue; }
    const scratch = join(home, "downloading");
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(scratch, { recursive: true });
    gh(["release", "download", DATA_TAG, "--repo", repository(), "--pattern", name, "--dir", scratch, "--clobber"]);
    const got = join(scratch, name);
    const sha = sha256File(got);
    if (sha !== asset.sha256) throw new Error(`${name}: downloaded sha256 ${sha}, the manifest says ${asset.sha256}`);
    renameSync(got, join(home, file));
    console.log(`${name}: ${asset.bytes} bytes, verified`);
  }
  unpackGcat(home);
}

export function upload(home: string, now = Date.now()): void {
  packGcat(home);
  const local = manifestOf(home, now);
  if (local.assets["states.json.gz"] === undefined) throw new Error(`no states to upload under ${home}`);
  const released = releasedManifest();
  let exists = true;
  let present: string[] = [];
  try { present = (JSON.parse(gh(["release", "view", DATA_TAG, "--repo", repository(), "--json", "assets"])) as { assets: { name: string }[] }).assets.map((a) => a.name); } catch { exists = false; }
  // What the manifest names with another hash, and what the release lacks whatever the manifest says.
  const names = [...new Set([...toUpload(local, released), ...Object.keys(local.assets).filter((name) => !present.includes(name))])];
  if (!exists) gh(["release", "create", DATA_TAG, "--repo", repository(), "--title", "The live run's data", "--notes", "The frozen detector's states at the end of the last hourly run, the GCAT snapshot it names objects from, and a manifest of hashes. Replaced by every run; not for reading by hand.", "--prerelease"]);
  for (const name of names) {
    gh(["release", "upload", DATA_TAG, join(home, ASSETS[name]!), "--repo", repository(), "--clobber"]);
    console.log(`${name}: uploaded (${local.assets[name]!.bytes} bytes)`);
  }
  const manifestPath = join(home, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(local, null, 1)}\n`);
  gh(["release", "upload", DATA_TAG, manifestPath, "--repo", repository(), "--clobber"]);
  console.log(`manifest: ${Object.keys(local.assets).length} assets, ${names.length} uploaded`);
}

function main(): void {
  const [command] = process.argv.slice(2);
  const home = process.argv.includes("--home") ? process.argv[process.argv.indexOf("--home") + 1]! : join(process.env.RENDEZVOUS_ARCHIVE ?? join(import.meta.dirname, "../../../rendezvous-archive"), "live");
  if (command === "download") download(home);
  else if (command === "upload") upload(home);
  else throw new Error("usage: live:data -- download|upload [--home <dir>]");
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("live/data.ts")) main();
