import { describe, expect, it } from "vitest";
import type { PublishedRendezvousEntry } from "../../src/published.ts";
import { issueOf, keyOf, toOpen } from "./hold-issues.ts";

const entry = (over: Partial<PublishedRendezvousEntry>): PublishedRendezvousEntry => ({
  id: "68762-59103-2026-10-16", state: "confirmed",
  chaser: { catalogueNumber: 68762, designator: "2026-083H", name: "Kosmos-2612", owner: "VVKOV", ownerState: "RU", launchedOn: "2026-04-16" },
  target: { catalogueNumber: 59103, designator: "2024-043BB", name: "ICEYE-X36", owner: "ICEYE", ownerState: "FI", launchedOn: "2024-03-04" },
  regime: "LEO", besideAt: "2026-10-16T14:14:00.000Z", confirmedAt: "2026-10-16T15:49:00.000Z", leftAt: null,
  plane: { at: "2026-10-07T14:07:00.000Z", publishedAt: null, distanceKm: 900, deltaAKm: 4.2, thetaDeg: 0.05 }, height: null,
  nearestKm: 2.5, nearestAt: "2026-10-17T00:00:00.000Z", row: null, reports: [], ...over,
});

describe("the hold issues", () => {
  it("opens one per confirmed or left hold not yet carrying its key, never for a hold only raised", () => {
    const a = entry({});
    const b = entry({ id: "1-2-2026-10-01", state: "beside" });
    const c = entry({ id: "3-4-2026-10-02", state: "left" });
    const issues = [{ number: 1, title: "x", body: `something\n${keyOf(a.id)}\n`, state: "CLOSED", url: "" }];
    expect(toOpen([a, b, c], issues).map((e) => e.id)).toEqual([c.id]);
  });
  it("names the two objects, their owners, the geometry and the published file, says nothing of intent, and uses no dash as punctuation", () => {
    const { title, body } = issueOf(entry({}));
    expect(title).toBe("Kosmos-2612 (68762) beside ICEYE-X36 (59103) since 2026-10-16");
    expect(body).toContain("Kosmos-2612 (68762, VVKOV RU)");
    expect(body).toContain("ICEYE-X36 (59103, ICEYE FI)");
    expect(body).toContain("2.5 km");
    expect(body).toContain("https://orbinauts.github.io/rendezvous/v1/rendezvous/68762-59103-2026-10-16.json");
    expect(body).toContain(keyOf("68762-59103-2026-10-16"));
    expect(body).not.toMatch(/intent/i);
    expect(body.replace(/<!--.*?-->/g, "").replace(/https?:\S+/g, "").replace(/^- /gm, "").replace(/\d-\d/g, "")).not.toMatch(/\s[-–—]\s|—|–/);
  });
});
