import { describe, expect, it } from "vitest";
import { newStates } from "./detector.ts";
import { reviveStates, serialiseStates } from "./states.ts";

describe("the states as text", () => {
  it("round-trips the maps and the numbers JSON cannot carry", () => {
    const states = newStates();
    states.startedMs = 1;
    states.objects.set(5, { latest: { number: 5, designator: null, epochMs: 1, createdMs: null, meanMotion: 15, eccentricity: 0, inclinationDeg: 0, raanDeg: 0, argpDeg: 0, meanAnomalyDeg: 0, bstar: 0, meanMotionDot: 0, meanMotionDdot: 0, elementSetNumber: 0, revAtEpoch: 0 }, previous: null, firstSeenMs: null });
    states.pairs.set("5-6", { chaser: 5, target: 6, createdMs: 1, exclusion: null, lastTheta: Number.POSITIVE_INFINITY, outOfPlaneSinceMs: null, lastEvalMs: 1, height: false, heightOffCount: 0, beside: "none", besideRaisedAt: null, besideConfirmedAt: null, leftRaisedAt: null, lastDistanceKm: Number.NaN, nearestKm: null, planeAt: 1, heightAt: null });
    const back = reviveStates(serialiseStates(states));
    expect(back.objects.get(5)?.latest.meanMotion).toBe(15);
    expect(back.pairs.get("5-6")?.lastTheta).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isNaN(back.pairs.get("5-6")?.lastDistanceKm)).toBe(true);
    expect(back.startedMs).toBe(1);
  });
  it("refuses text that is not the states", () => {
    expect(() => reviveStates("{}")).toThrow();
  });
});
