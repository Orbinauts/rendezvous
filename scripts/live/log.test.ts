import { describe, expect, it } from "vitest";
import type { Verdict } from "../../src/detector.ts";
import { jsonl, newVerdicts, unlogged, verdictKey } from "./log.ts";

const verdict = (over: Partial<Verdict>): Verdict => ({ stage: "beside", state: "raised", chaser: 1, target: 2, at: 1000, publishedAt: 2000, exclusion: null, evidence: { thetaDeg: 0, nodeDeg: 0, inclinationDeg: 97, deltaAKm: 0, deltaE: 0, distanceKm: 10, distanceLaterKm: 12, nearestKm: 10 }, ...over });

describe("the live run's log", () => {
  it("logs a verdict once however many runs raise it, and keeps the order", () => {
    const a = verdict({});
    const b = verdict({ state: "confirmed", at: 5000 });
    const c = verdict({ chaser: 3, at: 1000 });
    expect(newVerdicts([a], [a, b, c, b])).toEqual([b, c]);
    expect(verdictKey(a)).toBe("1-2-beside-raised-1000");
  });
  it("writes one line a verdict and reads the detector's verdict back from a logged one", () => {
    const text = jsonl([{ ...verdict({}), loggedAt: "2026-10-22T10:00:00.000Z", runUrl: null }]);
    expect(text.endsWith("\n")).toBe(true);
    expect(unlogged(JSON.parse(text))).toEqual(verdict({}));
  });
});
