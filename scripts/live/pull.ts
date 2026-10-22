import { join } from "node:path";
import { DAY_MS, type OmmRow } from "../../src/elements.ts";
import type { SpaceTrack } from "../archive/space-track.ts";

/**
 * The live run's pull: the sets the catalogue published since the last
 * run, by `CREATION_DATE`, every object, from the history class. The
 * range is read a day at a time at most (a run after a gap of days makes
 * a request a day, spaced out), each chunk inclusive at both ends, so the
 * boundary set is read twice and skipped by the detector, which reads no
 * set older than an object's latest. Each answer is kept under the run's
 * directory (`pulls/`), on the runner only.
 */

export const FIELDS = ["NORAD_CAT_ID", "OBJECT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR", "MEAN_MOTION_DOT", "MEAN_MOTION_DDOT", "ELEMENT_SET_NO", "REV_AT_EPOCH", "CREATION_DATE", "GP_ID"] as const;

/** The catalogue's form of an instant in a query: `YYYY-MM-DD HH:MM:SS`, UTC, the space encoded. */
export const stamp = (ms: number): string => new Date(ms).toISOString().slice(0, 19).replace("T", "%20");

export const sinceQuery = (fromMs: number, toMs: number): string => `/basicspacedata/query/class/gp_history/CREATION_DATE/${stamp(fromMs)}--${stamp(toMs)}/orderby/CREATION_DATE%20asc,GP_ID%20asc/predicates/${FIELDS.join(",")}/format/json`;

/** The chunks a range is read in: each at most `chunkMs` long, the last ending at `untilMs`; none where there is nothing to read. */
export function chunksOf(sinceMs: number, untilMs: number, chunkMs = DAY_MS): { fromMs: number; toMs: number }[] {
  const chunks: { fromMs: number; toMs: number }[] = [];
  for (let from = sinceMs; from < untilMs; from += chunkMs) chunks.push({ fromMs: from, toMs: Math.min(from + chunkMs, untilMs) });
  return chunks;
}

/** The latest publication time among rows, or null where there are none. */
export function latestCreated(rows: readonly OmmRow[]): number | null {
  let latest: number | null = null;
  for (const row of rows) {
    if (!row.CREATION_DATE) continue;
    const ms = Date.parse(`${row.CREATION_DATE}Z`);
    if (Number.isFinite(ms) && (latest === null || ms > latest)) latest = ms;
  }
  return latest;
}

/** Pulls the rows published in the range, chunk by chunk, keeping each answer under `dir`; the rows in the order the catalogue gave them. */
export async function pullSince(client: SpaceTrack, dir: string, sinceMs: number, untilMs: number): Promise<{ rows: OmmRow[]; requests: number }> {
  const rows: OmmRow[] = [];
  let requests = 0;
  for (const { fromMs, toMs } of chunksOf(sinceMs, untilMs)) {
    const name = `${new Date(fromMs).toISOString().replace(/[:.]/g, "")}-${new Date(toMs).toISOString().replace(/[:.]/g, "")}.json.gz`;
    const { text, cached } = await client.text(join(dir, "pulls", name), sinceQuery(fromMs, toMs));
    if (!cached) requests++;
    for (const row of JSON.parse(text) as OmmRow[]) rows.push(row);
  }
  return { rows, requests };
}
