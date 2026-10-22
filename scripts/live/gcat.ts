import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GCAT_ORGS_URL, GCAT_SATCAT_URL } from "../truth/gcat.ts";

/**
 * The GCAT snapshot the live run names objects and reads owners from:
 * `satcat.tsv` and `orgs.tsv` under the run's `gcat/` directory, with
 * `gcat.json` saying the day they were fetched. A run whose snapshot is
 * older than the day fetches both again from planet4589.org, at most once
 * a day across runs since the snapshot travels with the run's data; a
 * fetch that fails leaves the snapshot it has, with a warning, since the
 * catalogue is a courtesy of its author and a day's staleness changes
 * nothing the detector reads.
 */

const USER_AGENT = "Orbinauts (https://orbinauts.com; hello@orbinauts.com)";

export interface GcatStamp {
  fetchedOn: string;
}

export const gcatStampOf = (dir: string): GcatStamp | null => (existsSync(join(dir, "gcat.json")) && existsSync(join(dir, "satcat.tsv")) && existsSync(join(dir, "orgs.tsv")) ? (JSON.parse(readFileSync(join(dir, "gcat.json"), "utf8")) as GcatStamp) : null);

/** Whether the snapshot is to be fetched: none held, or held before today. */
export const isStale = (stamp: GcatStamp | null, today: string): boolean => stamp === null || stamp.fetchedOn < today;

async function page(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const text = await response.text();
  if (!text.startsWith("#")) throw new Error(`${url}: not a GCAT table`);
  return text;
}

/** The snapshot current for today, fetched where stale; says whether it was refreshed. */
export async function ensureGcat(dir: string, today: string, fetchPage: (url: string) => Promise<string> = page): Promise<{ stamp: GcatStamp; refreshed: boolean }> {
  const held = gcatStampOf(dir);
  if (!isStale(held, today)) return { stamp: held!, refreshed: false };
  try {
    const [satcat, orgs] = await Promise.all([fetchPage(GCAT_SATCAT_URL), fetchPage(GCAT_ORGS_URL)]);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "satcat.tsv.fetching"), satcat);
    writeFileSync(join(dir, "orgs.tsv.fetching"), orgs);
    renameSync(join(dir, "satcat.tsv.fetching"), join(dir, "satcat.tsv"));
    renameSync(join(dir, "orgs.tsv.fetching"), join(dir, "orgs.tsv"));
    const stamp: GcatStamp = { fetchedOn: today };
    writeFileSync(join(dir, "gcat.json"), `${JSON.stringify(stamp)}\n`);
    return { stamp, refreshed: true };
  } catch (error) {
    if (held === null) throw error;
    console.warn(`GCAT not refreshed, keeping the snapshot of ${held.fetchedOn}: ${error instanceof Error ? error.message : String(error)}`);
    return { stamp: held, refreshed: false };
  }
}
