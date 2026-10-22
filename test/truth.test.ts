import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readHandFile } from "../src/truth.ts";
import { buildTruth, truthText } from "../scripts/truth/build-truth.ts";

const root = new URL("../", import.meta.url);

describe("the ground truth", () => {
  it("is the committed file, rebuilt from the hand files and the snapshots", () => {
    const { file, report } = buildTruth();
    expect(truthText(file)).toBe(readFileSync(new URL("data/rendezvous.json", root), "utf8"));
    expect(report).toBe(readFileSync(new URL("docs/truth.md", root), "utf8"));
  });
  it("has every statement well formed, with a source, a day and at least one stage", () => {
    for (const name of ["leo.json", "luch.json", "geo.json"]) {
      const hand = readHandFile(name, JSON.parse(readFileSync(new URL(`data/truth/hand/${name}`, root), "utf8")));
      expect(hand.statements.length).toBeGreaterThan(0);
    }
  });
  it("refuses a statement with no stage, or a window ending before it starts", () => {
    const good = JSON.parse(readFileSync(new URL("data/truth/hand/leo.json", root), "utf8")).statements[0];
    expect(() => readHandFile("x", { about: "", statements: [{ ...good, plane: null, height: null, beside: null, closest: null, left: null }] })).toThrow(/at least one stage/);
    expect(() => readHandFile("x", { about: "", statements: [{ ...good, left: { stated: "", from: "2026-10-19", to: "2026-10-18", precision: "day" } }] })).toThrow(/before/);
  });
  it("dates every case, and gives each a unique id with the chaser, the target and the opening day", () => {
    const { file } = buildTruth();
    const ids = new Set<string>();
    for (const c of file.cases) {
      expect(c.window.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.id.endsWith(c.window.from)).toBe(true);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });
});
