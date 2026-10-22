import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import type { ElementSet } from "../../src/elements.ts";
import { dayAfter, slices, yearColumns } from "../replay/sources.ts";
import { archiveHome } from "./pull-days.ts";

/**
 * Writes a span's day slices into this Archive from breakups' (its slices
 * or its yearly columns), so the span is held whole here, apart from breakups:
 * `npm run archive:export -- <from> <to> [--from-archive <dir>]`. A slice
 * written from year columns prints each set's fields as the history class
 * does, with no CREATION_DATE, since the bundles keep none. A day already
 * held is left as it is.
 */

const FROM_ARCHIVE = resolve(import.meta.dirname, "../../../breakups-archive");

function row(s: ElementSet): Record<string, string> {
  const r: Record<string, string> = { NORAD_CAT_ID: String(s.number), OBJECT_ID: s.designator ?? "", EPOCH: new Date(s.epochMs).toISOString().replace("Z", ""), MEAN_MOTION: s.meanMotion.toFixed(8), ECCENTRICITY: s.eccentricity.toFixed(7), INCLINATION: s.inclinationDeg.toFixed(4), RA_OF_ASC_NODE: s.raanDeg.toFixed(4), ARG_OF_PERICENTER: s.argpDeg.toFixed(4), MEAN_ANOMALY: s.meanAnomalyDeg.toFixed(4), BSTAR: String(s.bstar), MEAN_MOTION_DOT: String(s.meanMotionDot), MEAN_MOTION_DDOT: String(s.meanMotionDdot), ELEMENT_SET_NO: String(s.elementSetNumber), REV_AT_EPOCH: String(s.revAtEpoch) };
  if (s.createdMs !== null) r.CREATION_DATE = new Date(s.createdMs).toISOString().replace("Z", "").slice(0, 19);
  return r;
}

function main(): void {
  const [from, to] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!from || !to) throw new Error("usage: export-span.ts <from> <to>");
  const i = process.argv.indexOf("--from-archive");
  const source = i >= 0 ? process.argv[i + 1]! : FROM_ARCHIVE;
  const archive = archiveHome();
  const years = new Set<number>();
  for (let d = from; d <= to; d = dayAfter(d)) years.add(Number(d.slice(0, 4)));
  let written = 0;
  for (const y of years) {
    const sl = slices([source], y);
    const src = sl.sets(`${y}-01-15`) !== null || sl.sets(from) !== null ? sl : yearColumns(source, y);
    for (let d = from; d <= to; d = dayAfter(d)) {
      if (!d.startsWith(String(y))) continue;
      const path = join(archive, "history", String(y), `${d}.json.gz`);
      if (existsSync(path)) continue;
      const sets = src.sets(d);
      if (sets === null) { console.error(`${d}: no sets`); continue; }
      mkdirSync(join(archive, "history", String(y)), { recursive: true });
      writeFileSync(path, gzipSync(JSON.stringify({ pulledAt: new Date().toISOString(), exportedFrom: src.describe(), rows: sets.map(row) })));
      written++;
    }
  }
  console.log(`${written} days written under ${archive}/history`);
}

main();
