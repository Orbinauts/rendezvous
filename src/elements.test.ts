import { describe, expect, it } from "vitest";
import { assumedDecimal, designatorOfTle, fromLines, fromRow, isLeo, nodeRateDegPerDay, planeAngleDeg, semiMajorAxisKm, type ElementSet } from "./elements.ts";

const line1 = "1 39336U 10042H   26096.68913718 -.00000435  00000-0 -62765-2 0  9999";
const line2 = "2 39336  24.5885 326.4963 7282246 222.6447  49.0098  2.02840568   497";

describe("the two-line fields", () => {
  it("reads an assumed decimal with its sign and exponent", () => {
    expect(assumedDecimal("-62765-2")).toBeCloseTo(-0.0062765, 9);
    expect(assumedDecimal(" 00000-0")).toBe(0);
    expect(assumedDecimal(" 12345-3")).toBeCloseTo(0.00012345, 10);
  });
  it("reads the designator in the catalogue's form", () => {
    expect(designatorOfTle("10042H  ")).toBe("2010-042H");
    expect(designatorOfTle("67040B  ")).toBe("1967-040B");
    expect(designatorOfTle("        ")).toBeNull();
  });
  it("reads a set from its two lines", () => {
    const set = fromLines(39336, Date.parse("2026-04-06T16:32:21.452Z"), null, line1, line2);
    expect(set.designator).toBe("2010-042H");
    expect(set.inclinationDeg).toBe(24.5885);
    expect(set.raanDeg).toBe(326.4963);
    expect(set.eccentricity).toBeCloseTo(0.7282246, 7);
    expect(set.meanMotion).toBeCloseTo(2.02840568, 8);
    expect(set.bstar).toBeCloseTo(-0.0062765, 9);
    expect(set.meanMotionDot).toBeCloseTo(-0.00000435, 10);
  });
  it("reads an OMM row and a row of two lines alike", () => {
    const omm = fromRow({ NORAD_CAT_ID: "39336", OBJECT_ID: "2010-042H", EPOCH: "2026-04-06T16:32:21.452352", MEAN_MOTION: "2.02840568", ECCENTRICITY: "0.7282246", INCLINATION: "24.5885", RA_OF_ASC_NODE: "326.4963", ARG_OF_PERICENTER: "222.6447", MEAN_ANOMALY: "49.0098", BSTAR: "-0.0062765", MEAN_MOTION_DOT: "-0.00000435", MEAN_MOTION_DDOT: "0", ELEMENT_SET_NO: "999", REV_AT_EPOCH: "49", CREATION_DATE: "2026-07-19T06:47:38" });
    const tle = fromRow({ NORAD_CAT_ID: "39336", EPOCH: "2026-04-06T16:32:21.452352", CREATION_DATE: "2026-07-19T06:47:38", TLE_LINE1: line1, TLE_LINE2: line2 });
    for (const key of ["number", "designator", "epochMs", "createdMs", "meanMotion", "inclinationDeg", "raanDeg", "argpDeg", "meanAnomalyDeg", "revAtEpoch"] as const) expect(tle[key]).toBe(omm[key]);
    expect(tle.eccentricity).toBeCloseTo(omm.eccentricity, 7);
    expect(tle.bstar).toBeCloseTo(omm.bstar, 9);
  });
  it("refuses a field that is not a number", () => {
    expect(() => fromRow({ NORAD_CAT_ID: "1", EPOCH: "2026-01-01T00:00:00", MEAN_MOTION: "x", ECCENTRICITY: "0", INCLINATION: "0", RA_OF_ASC_NODE: "0", ARG_OF_PERICENTER: "0", MEAN_ANOMALY: "0", BSTAR: "0", MEAN_MOTION_DOT: "0", MEAN_MOTION_DDOT: "0" })).toThrow(/MEAN_MOTION/);
  });
});

const circular = (over: Partial<ElementSet>): ElementSet => ({ number: 1, designator: null, epochMs: Date.parse("2026-10-16T12:00:00Z"), createdMs: null, meanMotion: 15.2, eccentricity: 0.0005, inclinationDeg: 97.85, raanDeg: 71.8, argpDeg: 100, meanAnomalyDeg: 260, bstar: 0.0001, meanMotionDot: 0.00001, meanMotionDdot: 0, elementSetNumber: 999, revAtEpoch: 1, ...over });

describe("the geometry", () => {
  it("gives the semi-major axis by Kepler's third law", () => {
    expect(semiMajorAxisKm(15.5)).toBeCloseTo(6790, -1);
    expect(semiMajorAxisKm(1.0027)).toBeCloseTo(42164, -1);
  });
  it("precesses a sun-synchronous node by about a degree a day eastward", () => {
    const rate = nodeRateDegPerDay(circular({}));
    expect(rate).toBeGreaterThan(0.9);
    expect(rate).toBeLessThan(1.1);
  });
  it("reads no angle between a plane and itself, and the inclination difference between planes of one node", () => {
    const a = circular({});
    expect(planeAngleDeg(a, a, a.epochMs)).toBeLessThan(1e-5);
    expect(planeAngleDeg(a, circular({ inclinationDeg: 97.05 }), a.epochMs)).toBeCloseTo(0.8, 3);
    expect(planeAngleDeg(a, circular({ raanDeg: 72.8 }), a.epochMs)).toBeCloseTo(0.99, 2);
  });
  it("carries each node to the instant, so two sets of different epochs on one orbit share a plane", () => {
    const a = circular({});
    const b = circular({ epochMs: a.epochMs + 86_400_000, raanDeg: a.raanDeg + nodeRateDegPerDay(a) });
    expect(planeAngleDeg(a, b, a.epochMs)).toBeLessThan(1e-6);
  });
  it("scopes low Earth orbit by period and eccentricity", () => {
    expect(isLeo(circular({}))).toBe(true);
    expect(isLeo(circular({ meanMotion: 2.0 }))).toBe(false);
    expect(isLeo(circular({ eccentricity: 0.7 }))).toBe(false);
  });
});
