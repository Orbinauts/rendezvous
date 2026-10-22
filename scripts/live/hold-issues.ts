import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PublishedRendezvousEntry, PublishedRendezvousFile } from "../../src/published.ts";
import { createIssue, ensureLabel, issuesLabelled, type Issue } from "./github.ts";
import { placesOf } from "./run.ts";

/**
 * An issue for each published hold once a later set has confirmed it:
 * `npm run live:issues`, after the publishing. The issue is how the
 * owner hears of a hold the hour it is confirmed; it names the two
 * objects and their owners, the geometry and the published file, and
 * nothing of intent. One issue per published id, however many runs see
 * it: the id is kept in a hidden line of the body and looked for before
 * opening.
 */

export const HOLD_LABEL = "rendezvous";
const HOLD_COLOR = "0E8A16";
const HOLD_DESCRIPTION = "A hold the detector published: two objects beside each other";
export const PAGES_BASE = "https://orbinauts.github.io/rendezvous";

export const keyOf = (id: string): string => `<!-- rendezvous:${id} -->`;

/** The entries to open an issue for: confirmed or left, with no issue carrying their key. */
export function toOpen(entries: readonly PublishedRendezvousEntry[], issues: readonly Issue[]): PublishedRendezvousEntry[] {
  return entries.filter((e) => (e.state === "confirmed" || e.state === "left") && !issues.some((issue) => issue.body.includes(keyOf(e.id))));
}

const who = (o: PublishedRendezvousEntry["chaser"]): string => `${o.name} (${o.catalogueNumber}${o.owner ? `, ${o.owner}${o.ownerState ? ` ${o.ownerState}` : ""}` : ""})`;
const km = (v: number | null): string => (v === null ? "unknown" : `${v.toFixed(1)} km`);

export function issueOf(e: PublishedRendezvousEntry): { title: string; body: string } {
  const title = `${e.chaser.name} (${e.chaser.catalogueNumber}) beside ${e.target.name} (${e.target.catalogueNumber}) since ${e.besideAt.slice(0, 10)}`;
  const lines = [
    `The detector published a hold: **${who(e.chaser)}** moved onto the orbit of **${who(e.target)}** and is holding beside it.`,
    "",
    `- State: ${e.state}`,
    `- Hold raised at ${e.besideAt}${e.confirmedAt ? `, confirmed at ${e.confirmedAt}` : ""}${e.leftAt ? `, left at ${e.leftAt}` : ""}`,
    `- Nearest distance read: ${km(e.nearestKm)}${e.nearestAt ? ` at ${e.nearestAt}` : ""}`,
    e.plane ? `- Plane matched at ${e.plane.at} (${e.plane.thetaDeg.toFixed(3)} degrees between the orbit normals)` : "- Plane: no earlier plane stage on this pair",
    e.height ? `- Height matched at ${e.height.at} (${e.height.deltaAKm.toFixed(2)} km between the semi-major axes)` : "- Height: no earlier height stage on this pair",
    e.row ? `- Lands on the ground truth's case ${e.row}, with ${e.reports.length} public ${e.reports.length === 1 ? "report" : "reports"}, the first on ${e.reports[0]?.statedOn ?? "?"}` : "- No public report of it in the ground truth: the detector's own news",
    `- The published entry: ${PAGES_BASE}/v1/rendezvous/${e.id}.json`,
    "",
    "The geometry and the two operators are what the public element sets show; nothing here says why.",
    "",
    keyOf(e.id),
  ];
  return { title, body: `${lines.join("\n")}\n` };
}

function main(): void {
  const places = placesOf();
  const file = JSON.parse(readFileSync(join(places.published, "v1", "rendezvous.json"), "utf8")) as PublishedRendezvousFile;
  ensureLabel(HOLD_LABEL, HOLD_COLOR, HOLD_DESCRIPTION);
  const open = toOpen(file.rendezvous, issuesLabelled(HOLD_LABEL));
  for (const e of open) {
    const { title, body } = issueOf(e);
    console.log(`${e.id}: opened ${createIssue(title, body, HOLD_LABEL)}`);
  }
  console.log(`${file.rendezvous.length} published, ${open.length} new ${open.length === 1 ? "issue" : "issues"}`);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("hold-issues.ts")) main();
