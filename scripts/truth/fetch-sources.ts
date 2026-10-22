import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readHandFile } from "../../src/truth.ts";
import { GCAT_ORGS_URL, GCAT_SATCAT_URL, ORGS_COLUMNS, SATCAT_COLUMNS, readGcatPage, reducePage, sha256 } from "./gcat.ts";

/**
 * Makes the GCAT snapshots the truth is built from: the main catalogue
 * reduced to the objects the hand files name and the columns read, and the
 * organisations table reduced to their owners, each in GCAT's own form,
 * with the whole file's hash and size kept in `sources.json` so a new
 * edition is a visible change. `npm run truth:fetch [--from <dir>]`: with
 * `--from`, reads `satcat.tsv` and `orgs.tsv` from that directory instead
 * of fetching them.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const USER_AGENT = "Orbinauts (https://orbinauts.com; hello@orbinauts.com)";

async function page(url: string, from: string | undefined, file: string): Promise<string> {
  if (from !== undefined) return readFileSync(join(from, file), "utf8");
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function numbersNamed(): Set<number> {
  const numbers = new Set<number>();
  const dir = join(ROOT, "data/truth/hand");
  for (const file of ["leo.json", "luch.json", "geo.json"]) {
    const hand = readHandFile(file, JSON.parse(readFileSync(join(dir, file), "utf8")));
    for (const s of hand.statements) {
      for (const o of [s.chaser, s.target, ...(s.alsoNear ?? [])]) {
        if (o.catalogueNumber !== null) numbers.add(o.catalogueNumber);
        for (const n of o.candidates ?? []) numbers.add(n);
      }
    }
  }
  return numbers;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fromIndex = args.indexOf("--from");
  const from = fromIndex >= 0 ? args[fromIndex + 1] : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const numbers = numbersNamed();
  const satcatText = await page(GCAT_SATCAT_URL, from, "satcat.tsv");
  const satcat = readGcatPage(satcatText, "satcat.tsv");
  const numberCol = satcat.column("Satcat");
  const ownerCol = satcat.column("Owner");
  const owners = new Set<string>();
  const satcatSnapshot = reducePage(satcat, SATCAT_COLUMNS, (row) => {
    const keep = /^\d+$/.test(row[numberCol] ?? "") && numbers.has(Number(row[numberCol]));
    if (keep) for (const code of (row[ownerCol] ?? "").split("/")) owners.add(code);
    return keep;
  });
  const orgsText = await page(GCAT_ORGS_URL, from, "orgs.tsv");
  const orgs = readGcatPage(orgsText, "orgs.tsv");
  const codeCol = orgs.column("Code");
  const parentCol = orgs.column("Parent");
  // Keep each owner and the chain of its parents.
  const byCode = new Map(orgs.rows.map((row) => [row[codeCol] ?? "", row] as const));
  const wanted = new Set<string>();
  for (const code of owners) {
    let current: string | undefined = code;
    while (current !== undefined && current !== "-" && !wanted.has(current)) {
      wanted.add(current);
      current = byCode.get(current)?.[parentCol];
    }
  }
  const orgsSnapshot = reducePage(orgs, ORGS_COLUMNS, (row) => wanted.has(row[codeCol] ?? ""));
  const dir = join(ROOT, "data/truth/sources");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "gcat-satcat.tsv"), satcatSnapshot);
  writeFileSync(join(dir, "gcat-orgs.tsv"), orgsSnapshot);
  const sourcesPath = join(ROOT, "data/truth/sources.json");
  const previous = existsSync(sourcesPath) ? JSON.parse(readFileSync(sourcesPath, "utf8")) : { about: "", snapshots: {} };
  const record = {
    about: "The snapshots the truth is built from, as made by scripts/truth/fetch-sources.ts, with the hash and size of each whole file so a new edition is a visible change. The hand files are the statements typed by a person; they are not snapshots.",
    snapshots: {
      "gcat-satcat": { url: GCAT_SATCAT_URL, fetchedOn: from === undefined ? today : (previous.snapshots?.["gcat-satcat"]?.fetchedOn ?? today), originalSha256: sha256(satcatText), originalBytes: Buffer.byteLength(satcatText), snapshot: "sources/gcat-satcat.tsv", madeWith: `reduced to the rows of the objects the hand files name, in the columns ${SATCAT_COLUMNS.join(", ")}, every kept cell verbatim`, snapshotSha256: sha256(satcatSnapshot), updated: satcat.updated, licence: "CC-BY-4.0, Jonathan McDowell, planet4589.org" },
      "gcat-orgs": { url: GCAT_ORGS_URL, fetchedOn: from === undefined ? today : (previous.snapshots?.["gcat-orgs"]?.fetchedOn ?? today), originalSha256: sha256(orgsText), originalBytes: Buffer.byteLength(orgsText), snapshot: "sources/gcat-orgs.tsv", madeWith: `reduced to the owners of those objects and the chain of their parents, in the columns ${ORGS_COLUMNS.join(", ")}`, snapshotSha256: sha256(orgsSnapshot), updated: orgs.updated, licence: "CC-BY-4.0, Jonathan McDowell, planet4589.org" },
    },
  };
  writeFileSync(sourcesPath, `${JSON.stringify(record, null, 2)}\n`);
  const found = new Set(satcatSnapshot.split("\n").filter((l) => !l.startsWith("#") && l !== "").map((l) => Number(l.split("\t")[1])));
  const missing = [...numbers].filter((n) => !found.has(n));
  console.log(`${found.size} objects, ${wanted.size} organisations; GCAT updated ${satcat.updated}`);
  if (missing.length > 0) console.log(`not in GCAT: ${missing.join(", ")}`);
}

await main();
