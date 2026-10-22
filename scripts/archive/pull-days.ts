import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { credentialsFromEnv, SpaceTrack } from "./space-track.ts";

/**
 * Pulls whole days of the catalogue's history class, one request a day of
 * epochs, every object, and keeps each as `<archive>/history/<year>/<day>.json.gz`
 * in the form breakups keeps them (`{"pulledAt": <ISO>, "rows": [...]}`),
 * so the two Archives read alike: `node --env-file=<env> --experimental-strip-types
 * scripts/archive/pull-days.ts <from-day> <to-day>`. A day already kept is
 * not asked for again. The Archive's home is `RENDEZVOUS_ARCHIVE`, default
 * `../rendezvous-archive`.
 */

const FIELDS = ["NORAD_CAT_ID", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT", "ELEMENT_SET_NO", "REV_AT_EPOCH", "CREATION_DATE", "GP_ID"] as const;
export const dayQuery = (day: string, next: string): string => `/basicspacedata/query/class/gp_history/EPOCH/${day}--${next}/orderby/CREATION_DATE%20asc,GP_ID%20asc/predicates/${FIELDS.join(",")}/format/json`;
const dayAfter = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export const archiveHome = (): string => resolve(process.env.RENDEZVOUS_ARCHIVE ?? resolve(import.meta.dirname, "../../../rendezvous-archive"));

/** Pulls one day of epochs into `<archive>/history/<year>/<day>.json.gz`, the answer cached under `<archive>/scratch`; a day already kept is left, and null returned, unless `again`. */
export async function pullDay(client: SpaceTrack, archive: string, day: string, again = false): Promise<number | null> {
  const dir = join(archive, "history", day.slice(0, 4));
  const kept = join(dir, `${day}.json.gz`);
  if (existsSync(kept) && !again) return null;
  mkdirSync(dir, { recursive: true });
  const scratch = join(archive, "scratch", `${day}.json.gz`);
  if (again) rmSync(scratch, { force: true });
  const pulledAt = Date.now();
  const { text } = await client.text(scratch, dayQuery(day, dayAfter(day)));
  const rows = JSON.parse(text) as unknown[];
  writeFileSync(`${kept}.keeping`, gzipSync(`{"pulledAt":${JSON.stringify(new Date(pulledAt).toISOString())},"rows":${text}}`));
  renameSync(`${kept}.keeping`, kept);
  return rows.length;
}

async function main(): Promise<void> {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) throw new Error("usage: pull-days.ts <from-day> <to-day>");
  const archive = archiveHome();
  const client = new SpaceTrack(credentialsFromEnv(), archive);
  for (let day = from; day <= to; day = dayAfter(day)) {
    const n = await pullDay(client, archive, day);
    console.log(n === null ? `${day} kept` : `${day} ${n} sets`);
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("pull-days.ts")) await main();
