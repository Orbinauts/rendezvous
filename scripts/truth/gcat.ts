import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CatalogueObject } from "../../src/truth.ts";

/**
 * GCAT's main catalogue (`satcat.tsv`) and its organisations table
 * (`orgs.tsv`), as the truth reads them: one tab-separated line per object
 * under a header line of column names starting `#JCAT` (or `#Code`) and a
 * `# Updated` line. The truth keeps a snapshot reduced to the rows it
 * names and the columns it reads, so the build runs from the repository
 * alone; `npm run truth:fetch` makes the snapshot from the whole files.
 */

export const GCAT_SATCAT_URL = "https://planet4589.org/space/gcat/tsv/cat/satcat.tsv";
export const GCAT_ORGS_URL = "https://planet4589.org/space/gcat/tsv/tables/orgs.tsv";

/** The columns of the main catalogue the truth keeps and reads. */
export const SATCAT_COLUMNS = ["JCAT", "Satcat", "Launch_Tag", "Piece", "Type", "Name", "PLName", "LDate", "Status", "Owner", "State", "OpOrbit"] as const;
/** The columns of the organisations table the truth keeps and reads. */
export const ORGS_COLUMNS = ["Code", "UCode", "StateCode", "Type", "Class", "ShortName", "Name", "Parent", "EName"] as const;

export interface GcatPage {
  header: string[];
  updated: string;
  rows: string[][];
  column(name: string): number;
}

/** Reads a GCAT tab-separated page; throws, naming the file, where it is not one. */
export function readGcatPage(text: string, file: string): GcatPage {
  const lines = text.split("\n");
  const headerLine = lines.find((line) => line.startsWith("#JCAT") || line.startsWith("#Code"));
  if (headerLine === undefined) throw new Error(`${file}: no header line`);
  const header = headerLine.slice(1).split("\t").map((c) => c.trim());
  const updated = /^# Updated (.+)$/m.exec(text)?.[1]?.trim();
  if (updated === undefined) throw new Error(`${file}: no '# Updated' line`);
  const rows = lines.filter((line) => !line.startsWith("#") && line.trim() !== "").map((line) => line.split("\t").map((c) => c.trim()));
  return {
    header,
    updated,
    rows,
    column(name) {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`${file}: no column ${name}`);
      return i;
    },
  };
}

/** A page reduced to the given rows and columns, in GCAT's own form, so the snapshot reads back through `readGcatPage`. */
export function reducePage(page: GcatPage, columns: readonly string[], keep: (row: string[]) => boolean): string {
  const idx = columns.map((c) => page.column(c));
  const out = [`#${columns.join("\t")}`, `# Updated ${page.updated}`];
  for (const row of page.rows) if (keep(row)) out.push(idx.map((i) => row[i] ?? "").join("\t"));
  return `${out.join("\n")}\n`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The UTC day a GCAT date names, where it names a whole day without doubt (`2026 Apr 16`), else null. */
export function parseLDate(written: string): string | null {
  if (written.includes("?")) return null;
  const m = /^(\d{4}) ([A-Z][a-z]{2}) +(\d{1,2})(?: |$)/.exec(written.trim());
  if (m === null) return null;
  const month = MONTHS.indexOf(m[2]!) + 1;
  if (month === 0) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
}

export interface Org {
  code: string;
  state: string;
  class: string;
  name: string;
  parent: string | null;
}

/** The organisations, by code. */
export function readOrgs(text: string, file: string): Map<string, Org> {
  const page = readGcatPage(text, file);
  const [code, state, cls, name, ename, parent] = [page.column("Code"), page.column("StateCode"), page.column("Class"), page.column("Name"), page.column("EName"), page.column("Parent")];
  const orgs = new Map<string, Org>();
  for (const row of page.rows) {
    const c = row[code] ?? "";
    if (c === "") continue;
    const en = row[ename] ?? "-";
    orgs.set(c, { code: c, state: row[state] ?? "", class: row[cls] ?? "", name: en !== "-" && en !== "" ? en : (row[name] ?? c), parent: row[parent] && row[parent] !== "-" ? row[parent]! : null });
  }
  return orgs;
}

/** The catalogue's objects by number, with the owner's organisation resolved. */
export function readCatalogue(satcatText: string, orgs: Map<string, Org>, file: string): { objects: Map<number, CatalogueObject>; launchOf: Map<number, string>; updated: string } {
  const page = readGcatPage(satcatText, file);
  const [number, launch, type, name, plname, ldate, owner, state] = [page.column("Satcat"), page.column("Launch_Tag"), page.column("Type"), page.column("Name"), page.column("PLName"), page.column("LDate"), page.column("Owner"), page.column("State")];
  const objects = new Map<number, CatalogueObject>();
  const launchOf = new Map<number, string>();
  for (const row of page.rows) {
    const n = row[number] ?? "";
    if (!/^\d+$/.test(n)) continue;
    const catalogueNumber = Number(n);
    // A payload's own line wins over a line of its launch that shares the number.
    if (objects.has(catalogueNumber) && !(row[type] ?? "").startsWith("P")) continue;
    const ownerCode = row[owner] ?? "";
    const first = ownerCode.split("/")[0] ?? "";
    const org = orgs.get(first);
    const pl = row[plname] ?? "";
    objects.set(catalogueNumber, {
      catalogueNumber,
      designator: `${row[launch] ?? ""}${row[launch] && (row[launch]!.length === 8) ? "" : ""}`,
      name: row[name] ?? "",
      launchedOn: parseLDate(row[ldate] ?? ""),
      owner: ownerCode,
      ownerState: row[state] ?? org?.state ?? "",
      ownerClass: org?.class ?? null,
      ownerName: org?.name ?? null,
    });
    launchOf.set(catalogueNumber, row[launch] ?? "");
  }
  return { objects, launchOf, updated: page.updated };
}

export const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");
export const readText = (path: string): string => readFileSync(path, "utf8");
