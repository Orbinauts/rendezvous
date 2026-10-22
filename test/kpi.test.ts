import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DETECTOR_NAME, DETECTOR_PARAMETERS } from "../src/detector.ts";

const root = new URL("../", import.meta.url);
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("the committed scorecard", () => {
  const path = new URL("kpi/latest.json", root);
  it("was made with the detector, the truth and the exclusions the package ships", () => {
    if (!existsSync(path)) return;
    const latest = JSON.parse(readFileSync(path, "utf8"));
    expect(latest.detector).toBe(DETECTOR_NAME);
    expect(latest.parameters).toEqual(DETECTOR_PARAMETERS);
    expect(latest.truthSha256).toBe(sha256(readFileSync(new URL("data/rendezvous.json", root), "utf8")));
    expect(latest.exclusionsSha256).toBe(sha256(readFileSync(new URL("data/exclusions.json", root), "utf8")));
    const spans = JSON.parse(readFileSync(new URL("data/spans.json", root), "utf8")).spans;
    expect(latest.spans.map((s: { from: string; to: string }) => `${s.from}-${s.to}`)).toEqual(spans.map((s: { from: string; to: string }) => `${s.from}-${s.to}`));
  });
  it("counts what its rows say", () => {
    if (!existsSync(path)) return;
    const latest = JSON.parse(readFileSync(path, "utf8"));
    expect(latest.totals.detected).toBe(latest.cases.filter((c: { outcome: string }) => c.outcome === "detected").length);
    expect(latest.totals.false).toBe(latest.holds.filter((h: { outcome: string }) => h.outcome === "false").length);
    expect(latest.totals.holdsRaised).toBe(latest.holds.length);
  });
});
