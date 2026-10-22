import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Verdict } from "../../src/detector.ts";
import type { Body } from "../../src/exclusions.ts";
import type { TruthFile } from "../../src/truth.ts";
import { selectPublished } from "./select.ts";

const truth = JSON.parse(readFileSync(new URL("../../data/rendezvous.json", import.meta.url), "utf8")) as TruthFile;
const bodies = new Map<number, Body>([
  [68762, { number: 68762, name: "Kosmos-2612", launchTag: "2026-083", kind: "payload", launchedOn: "2026-04-16", owner: "VVKOV", ownerState: "RU", ownerDefence: true }],
  [59103, { number: 59103, name: "ICEYE-X36", launchTag: "2024-043", kind: "payload", launchedOn: "2024-03-04", owner: "ICEUS", ownerState: "US", ownerDefence: false }],
]);
const body = (n: number) => bodies.get(n);
const designator = (n: number) => (n === 68762 ? "2026-083H" : "2024-043F");
const at = (text: string): number => Date.parse(text);
const evidence = (distanceKm: number | null, deltaAKm = 0) => ({ thetaDeg: 0.002, nodeDeg: 0.001, inclinationDeg: 0.001, deltaAKm, deltaE: 0, distanceKm, distanceLaterKm: distanceKm, nearestKm: distanceKm });
const v = (stage: Verdict["stage"], state: Verdict["state"], when: string, distance: number | null, over: Partial<Verdict> = {}): Verdict => ({ stage, state, chaser: 68762, target: 59103, at: at(when), publishedAt: at(when) + 3_600_000 * 3, exclusion: null, evidence: evidence(distance), ...over });

describe("the published selection", () => {
  const verdicts = [
    v("plane", "raised", "2026-10-07T14:07:00Z", null, { how: "manoeuvre", match: "plane" }),
    v("height", "raised", "2026-10-12T22:39:00Z", 484),
    v("beside", "raised", "2026-10-16T14:14:00Z", 3.3),
    v("beside", "confirmed", "2026-10-16T15:49:00Z", 0.7),
    v("left", "raised", "2026-10-19T04:21:00Z", 244),
    v("left", "confirmed", "2026-10-19T07:32:00Z", 291),
  ];
  it("publishes a hold with its timeline, its state and the truth's case and reports", () => {
    const { list, details } = selectPublished(verdicts, body, designator, truth, null);
    expect(list.rendezvous).toHaveLength(1);
    const e = list.rendezvous[0]!;
    expect(e.id).toBe("68762-59103-2026-10-16");
    expect(e.state).toBe("left");
    expect(e.chaser.name).toBe("Kosmos-2612");
    expect(e.target.designator).toBe("2024-043F");
    expect(e.plane?.at).toBe("2026-10-07T14:07:00.000Z");
    expect(e.height?.at).toBe("2026-10-12T22:39:00.000Z");
    expect(e.confirmedAt).toBe("2026-10-16T15:49:00.000Z");
    expect(e.leftAt).toBe("2026-10-19T04:21:00.000Z");
    expect(e.nearestKm).toBe(0.7);
    expect(e.row).toBe("68762-59103:2026-09-30");
    expect(e.reports.length).toBeGreaterThan(3);
    expect(e.reports[0]!.statedOn <= e.reports.at(-1)!.statedOn).toBe(true);
    expect(details[0]!.verdicts).toHaveLength(4);
  });
  it("shows a hold raised by one set as beside, and confirmed once a later set agrees", () => {
    expect(selectPublished(verdicts.slice(0, 3), body, designator, truth, null).list.rendezvous[0]!.state).toBe("beside");
    expect(selectPublished(verdicts.slice(0, 4), body, designator, truth, null).list.rendezvous[0]!.state).toBe("confirmed");
  });
  it("shows nothing of a pair with an exclusion tag, nor a hold withdrawn as a bad fit", () => {
    expect(selectPublished(verdicts.map((x) => ({ ...x, exclusion: "station visitor" as const })), body, designator, truth, null).list.rendezvous).toHaveLength(0);
    const bad = [verdicts[2]!, v("beside", "withdrawn", "2026-10-16T20:00:00Z", 350)];
    expect(selectPublished(bad, body, designator, truth, null).list.rendezvous).toHaveLength(0);
  });
  it("keeps what was published and drops only an unconfirmed hold the run no longer finds", () => {
    const first = selectPublished(verdicts.slice(0, 3), body, designator, truth, null).list;
    const other = { ...first.rendezvous[0]!, id: "1-2-2026-01-01", state: "confirmed" as const };
    const previous = { version: 1 as const, rendezvous: [first.rendezvous[0]!, other] };
    const next = selectPublished([], body, designator, truth, previous);
    expect(next.dropped).toEqual(["68762-59103-2026-10-16"]);
    expect(next.list.rendezvous.map((e) => e.id)).toEqual(["1-2-2026-01-01"]);
    const again = selectPublished(verdicts, body, designator, truth, previous);
    expect(again.list.rendezvous.find((e) => e.id === "68762-59103-2026-10-16")?.state).toBe("left");
  });
});
