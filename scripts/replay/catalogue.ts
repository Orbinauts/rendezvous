import { readFileSync } from "node:fs";
import type { Body } from "../../src/exclusions.ts";
import { parseLDate, readGcatPage, readOrgs, type Org } from "../truth/gcat.ts";

/**
 * The catalogue's rows as the detector's `body` input, from GCAT's main
 * catalogue and organisations table (the whole files, or any reduction of
 * them that keeps the header lines): each object's name, kind, launch,
 * owner and the owner's state and class.
 */

export interface Catalogue {
  body(number: number): Body | undefined;
  updated: string;
  size: number;
}

export function readCatalogue(satcatPath: string, orgsPath: string): Catalogue {
  const orgs = readOrgs(readFileSync(orgsPath, "utf8"), orgsPath);
  const page = readGcatPage(readFileSync(satcatPath, "utf8"), satcatPath);
  const [number, launch, type, name, ldate, owner, state] = [page.column("Satcat"), page.column("Launch_Tag"), page.column("Type"), page.column("Name"), page.column("LDate"), page.column("Owner"), page.column("State")];
  const bodies = new Map<number, Body>();
  for (const row of page.rows) {
    const n = row[number] ?? "";
    if (!/^\d+$/.test(n)) continue;
    const t = (row[type] ?? "").charAt(0);
    const kind = t === "P" ? "payload" : t === "R" ? "rocket body" : t === "C" ? "component" : t === "D" ? "debris" : "unknown";
    const key = Number(n);
    if (bodies.has(key) && kind !== "payload") continue;
    const code = (row[owner] ?? "").split("/")[0] ?? "";
    const org: Org | undefined = orgs.get(code);
    bodies.set(key, { number: key, name: row[name] ?? "", launchTag: row[launch] ?? "", kind, launchedOn: parseLDate(row[ldate] ?? ""), owner: code, ownerState: row[state] ?? org?.state ?? "", ownerDefence: (org?.class ?? "").includes("D") });
  }
  return { body: (n) => bodies.get(n), updated: page.updated, size: bodies.size };
}
