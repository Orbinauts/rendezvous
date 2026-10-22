import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TruthFile } from "../../src/truth.ts";

/**
 * Writes the generated parts of the README from `kpi/latest.md` and the
 * truth, between their markers (`<!-- <name>:begin -->` and
 * `<!-- <name>:end -->`), as breakups' pages script does. The prose around
 * them is never touched. `npm run kpi:readme`; the README test checks the
 * parts against the files.
 */

const ROOT = resolve(import.meta.dirname, "../..");

export function block(text: string, name: string): string {
  const m = new RegExp(`<!-- ${name}:begin -->([\\s\\S]*?)<!-- ${name}:end -->`).exec(text);
  if (m === null) throw new Error(`no block ${name}`);
  return m[1]!;
}

export function withBlock(text: string, name: string, body: string): string {
  const re = new RegExp(`(<!-- ${name}:begin -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(text)) throw new Error(`no block ${name}`);
  return text.replace(re, `$1${body}$2`);
}

export function generatedReadme(readme: string, latestMd: string, truth: TruthFile): string {
  let out = withBlock(readme, "kpi:summary", block(latestMd, "kpi:summary"));
  out = withBlock(out, "truth:count", `${truth.cases.length} cases`);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const path = join(ROOT, "README.md");
  const out = generatedReadme(readFileSync(path, "utf8"), readFileSync(join(ROOT, "kpi/latest.md"), "utf8"), JSON.parse(readFileSync(join(ROOT, "data/rendezvous.json"), "utf8")) as TruthFile);
  writeFileSync(path, out);
  console.log("README written");
}
