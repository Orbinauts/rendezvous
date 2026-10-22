import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ASSETS, manifestOf, toUpload } from "./data.ts";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("the live run's data on the release", () => {
  it("names the files present with their hashes and uploads only what the release lacks or holds differently", () => {
    const home = mkdtempSync(join(tmpdir(), "rendezvous-data-"));
    dirs.push(home);
    mkdirSync(join(home, "gcat"), { recursive: true });
    writeFileSync(join(home, ASSETS["states.json.gz"]!), "states");
    writeFileSync(join(home, ASSETS["gcat.json"]!), "{}");
    const local = manifestOf(home, Date.parse("2026-10-22T10:00:00Z"));
    expect(Object.keys(local.assets).sort()).toEqual(["gcat.json", "states.json.gz"]);
    expect(local.assets["states.json.gz"]!.bytes).toBe(6);
    expect(toUpload(local, null).sort()).toEqual(["gcat.json", "states.json.gz"]);
    expect(toUpload(local, { ...local, assets: { "gcat.json": local.assets["gcat.json"]!, "states.json.gz": { bytes: 6, sha256: "other" } } })).toEqual(["states.json.gz"]);
    expect(toUpload(local, local)).toEqual([]);
  });
});
