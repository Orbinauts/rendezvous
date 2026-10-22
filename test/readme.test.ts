import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatedReadme } from "../scripts/kpi/pages.ts";
import type { TruthFile } from "../src/truth.ts";

const root = new URL("../", import.meta.url);

describe("the README", () => {
  it("carries the generated parts as the files give them", () => {
    const readme = readFileSync(new URL("README.md", root), "utf8");
    const latestPath = new URL("kpi/latest.md", root);
    if (!existsSync(latestPath)) return;
    const truth = JSON.parse(readFileSync(new URL("data/rendezvous.json", root), "utf8")) as TruthFile;
    expect(generatedReadme(readme, readFileSync(latestPath, "utf8"), truth)).toBe(readme);
  });
  it("uses no dash as punctuation in its prose", () => {
    const prose = readFileSync(new URL("README.md", root), "utf8").split("\n").filter((l) => !l.startsWith("|") && !l.startsWith("```") && !l.includes("://"));
    for (const line of prose) {
      expect(line.includes(" - ") && !line.startsWith("- ")).toBe(false);
      expect(line.includes("—")).toBe(false);
    }
  });
});
