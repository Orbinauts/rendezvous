import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { DETECTOR_NAME, type Verdict } from "../../src/detector.ts";
import { PUBLISHED_VERSION, type PublishedRendezvousFile, type PublishedStatusFile } from "../../src/published.ts";
import type { TruthFile } from "../../src/truth.ts";
import { readCatalogue } from "../replay/catalogue.ts";
import { selectPublished } from "./select.ts";

/**
 * Writes the published files from a run's verdicts:
 * `npm run published -- --verdicts <file.json or .json.gz> --gcat <dir> --out <dir> [--designators <file.json>]`.
 * The verdicts file is a replay's (`docs/replay/*.json`, `kpi/work/*.json.gz`)
 * or the live run's; `--out` is a checkout of the `published` branch, whose
 * `v1/` is read for the list already published and written again.
 */

const ROOT = resolve(import.meta.dirname, "../..");

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || process.argv[i + 1] === undefined) { if (fallback !== undefined) return fallback; throw new Error(`--${name} needed`); }
  return process.argv[i + 1]!;
}

const readJson = (path: string): unknown => JSON.parse(path.endsWith(".gz") ? gunzipSync(readFileSync(path)).toString("utf8") : readFileSync(path, "utf8"));

export interface WriteOptions {
  verdicts: Verdict[];
  designatorOf: (n: number) => string | null;
  /** The directory holding GCAT's `satcat.tsv` and `orgs.tsv`. */
  gcat: string;
  /** The checkout the files are written into, under `v1/`. */
  out: string;
  setsThrough: string | null;
  now: number;
  /** The repository whose truth and exclusions are read; this one by default. */
  root?: string;
}

/** Writes the published files from verdicts, merging into the list already under `out`; returns a line saying what it wrote. */
export function writePublished({ verdicts, designatorOf, gcat, out, setsThrough, now, root = ROOT }: WriteOptions): string {
  const catalogue = readCatalogue(join(gcat, "satcat.tsv"), join(gcat, "orgs.tsv"));
  const truthText = readFileSync(join(root, "data/rendezvous.json"), "utf8");
  const exclusionsText = readFileSync(join(root, "data/exclusions.json"), "utf8");
  const dir = join(out, `v${PUBLISHED_VERSION}`);
  const listPath = join(dir, "rendezvous.json");
  const previous = existsSync(listPath) ? (JSON.parse(readFileSync(listPath, "utf8")) as PublishedRendezvousFile) : null;
  const selection = selectPublished(verdicts, catalogue.body, designatorOf, JSON.parse(truthText) as TruthFile, previous);
  mkdirSync(join(dir, "rendezvous"), { recursive: true });
  writeFileSync(listPath, `${JSON.stringify(selection.list, null, 1)}\n`);
  for (const d of selection.details) writeFileSync(join(dir, "rendezvous", `${d.id}.json`), `${JSON.stringify(d, null, 1)}\n`);
  const status: PublishedStatusFile = { version: PUBLISHED_VERSION, ranAt: new Date(now).toISOString(), setsThrough, detector: DETECTOR_NAME, truthSha256: createHash("sha256").update(truthText).digest("hex"), exclusionsSha256: createHash("sha256").update(exclusionsText).digest("hex") };
  writeFileSync(join(dir, "status.json"), `${JSON.stringify(status, null, 1)}\n`);
  return `published ${selection.list.rendezvous.length} rendezvous (${selection.details.length} from this run${selection.dropped.length > 0 ? `, ${selection.dropped.length} withdrawn and dropped` : ""}) to ${dir}`;
}

function main(): void {
  const loaded = readJson(arg("verdicts")) as { verdicts: Verdict[]; designators?: Record<string, string | null>; setsThrough?: string | null };
  const designators = loaded.designators ?? {};
  console.log(writePublished({ verdicts: loaded.verdicts, designatorOf: (n) => designators[String(n)] ?? null, gcat: arg("gcat"), out: arg("out"), setsThrough: loaded.setsThrough ?? null, now: Date.now() }));
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("published/cli.ts")) main();
