import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { fromRow, type ElementSet, type OmmRow } from "../../src/elements.ts";

/**
 * Where the replay reads element sets: the day slices of the catalogue's
 * history class, as breakups keeps them (`<archive>/history/<year>/<day>.json.gz`,
 * a bare array of OMM rows or `{"pulledAt", "rows"}`), from one or more
 * Archives, the first that holds a day winning; and a year's columns as
 * breakups' Archive stores them (one gzipped typed array per field, sorted
 * by object then publication rank), for the years before the history class
 * was pulled. Both give the same thing: the sets with an epoch on each day.
 */

const DAY_MS = 86_400_000;
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const dayAfter = (day: string): string => dayOf(Date.parse(`${day}T00:00:00Z`) + DAY_MS);

export interface DaySource {
  /** The sets whose epoch falls on the day, or null where no source holds it. */
  sets(day: string): ElementSet[] | null;
  /** Whether the source knows when each set was published. */
  readonly timed: boolean;
  describe(): string;
}

/** Day slices from the given Archives, searched in order. */
export function slices(archives: string[], year: number): DaySource {
  const dirs = archives.map((a) => join(a, "history", String(year))).filter((d) => existsSync(d));
  return {
    timed: true,
    describe: () => `history slices of ${year} from ${dirs.join(", ")}`,
    sets(day) {
      for (const dir of dirs) {
        const path = join(dir, `${day}.json.gz`);
        if (!existsSync(path)) continue;
        const parsed = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as OmmRow[] | { pulledAt: string; rows: OmmRow[] };
        const rows = Array.isArray(parsed) ? parsed : parsed.rows;
        if (rows.length === 0) continue;
        return rows.map(fromRow);
      }
      return null;
    },
  };
}

const COLUMN_TYPES = {
  number: Uint32Array, epoch: Float64Array, meanMotion: Uint32Array, eccentricity: Uint32Array, inclination: Uint32Array, raan: Uint32Array, argOfPerigee: Uint32Array, meanAnomaly: Uint32Array, bstar: Float32Array, meanMotionDot: Int32Array, meanMotionDdot: Float32Array, elementSetNumber: Uint16Array, revAtEpoch: Uint32Array, rank: Uint32Array, created: Float64Array,
} as const;
type ColumnName = keyof typeof COLUMN_TYPES;

function readColumn<N extends ColumnName>(dir: string, name: N): InstanceType<(typeof COLUMN_TYPES)[N]> | null {
  const path = join(dir, `${name}.bin.gz`);
  if (!existsSync(path)) return null;
  const bytes = gunzipSync(readFileSync(path));
  const Type = COLUMN_TYPES[name];
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new (Type as any)(copy, 0, bytes.byteLength / Type.BYTES_PER_ELEMENT);
}

/** A year's columns from breakups' Archive, indexed by epoch day once at the first read. */
export function yearColumns(archive: string, year: number): DaySource {
  const dir = join(archive, String(year));
  if (!existsSync(join(dir, "epoch.bin.gz"))) throw new Error(`${dir} holds no year columns`);
  const designators = new Map<number, string | null>();
  for (const b of JSON.parse(readFileSync(join(dir, "bodies.json"), "utf8")) as { number: number; designator: string | null }[]) designators.set(b.number, b.designator);
  const c = {
    number: readColumn(dir, "number")!, epoch: readColumn(dir, "epoch")!, meanMotion: readColumn(dir, "meanMotion")!, eccentricity: readColumn(dir, "eccentricity")!, inclination: readColumn(dir, "inclination")!, raan: readColumn(dir, "raan")!, argOfPerigee: readColumn(dir, "argOfPerigee")!, meanAnomaly: readColumn(dir, "meanAnomaly")!, bstar: readColumn(dir, "bstar")!, meanMotionDot: readColumn(dir, "meanMotionDot")!, meanMotionDdot: readColumn(dir, "meanMotionDdot")!, elementSetNumber: readColumn(dir, "elementSetNumber")!, revAtEpoch: readColumn(dir, "revAtEpoch")!, created: readColumn(dir, "created"),
  };
  // Index the sets by epoch day: a sort of the indices by epoch, then day boundaries.
  const order = new Uint32Array(c.epoch.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  order.sort((x, y) => c.epoch[x]! - c.epoch[y]!);
  const byDay = new Map<string, [number, number]>();
  let start = 0;
  let currentDay = order.length > 0 ? dayOf(c.epoch[order[0]!]!) : "";
  for (let k = 1; k <= order.length; k++) {
    const day = k < order.length ? dayOf(c.epoch[order[k]!]!) : "";
    if (day !== currentDay) {
      byDay.set(currentDay, [start, k]);
      start = k;
      currentDay = day;
    }
  }
  return {
    timed: c.created !== null,
    describe: () => `year columns ${year} from ${dir}`,
    sets(day) {
      const range = byDay.get(day);
      if (range === undefined) return null;
      const sets: ElementSet[] = [];
      for (let k = range[0]; k < range[1]; k++) {
        const i = order[k]!;
        sets.push({
          number: c.number[i]!, designator: designators.get(c.number[i]!) ?? null, epochMs: c.epoch[i]!, createdMs: c.created === null ? null : c.created[i]!,
          meanMotion: c.meanMotion[i]! / 1e8, eccentricity: c.eccentricity[i]! / 1e7, inclinationDeg: c.inclination[i]! / 1e4, raanDeg: c.raan[i]! / 1e4, argpDeg: c.argOfPerigee[i]! / 1e4, meanAnomalyDeg: c.meanAnomaly[i]! / 1e4,
          bstar: c.bstar[i]!, meanMotionDot: c.meanMotionDot[i]! / 1e8, meanMotionDdot: c.meanMotionDdot[i]!, elementSetNumber: c.elementSetNumber[i]!, revAtEpoch: c.revAtEpoch[i]!,
        });
      }
      return sets;
    },
  };
}

/** The days a slice directory holds, sorted. */
export function daysHeld(archives: string[], year: number): string[] {
  const days = new Set<string>();
  for (const a of archives) {
    const dir = join(a, "history", String(year));
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)) days.add(f.slice(0, 10));
  }
  return [...days].sort();
}
