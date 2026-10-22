import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureGcat, gcatStampOf, isStale } from "./gcat.ts";

const dirs: string[] = [];
const fresh = (): string => { const d = mkdtempSync(join(tmpdir(), "rendezvous-gcat-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("the GCAT snapshot", () => {
  it("fetches once a day and keeps an old snapshot when the fetch fails", async () => {
    const dir = fresh();
    expect(gcatStampOf(dir)).toBeNull();
    expect(isStale(null, "2026-10-22")).toBe(true);
    let fetches = 0;
    const page = async (url: string): Promise<string> => { fetches++; return `# ${url}\n`; };
    const first = await ensureGcat(dir, "2026-10-22", page);
    expect(first).toEqual({ stamp: { fetchedOn: "2026-10-22" }, refreshed: true });
    expect(readFileSync(join(dir, "satcat.tsv"), "utf8")).toContain("satcat.tsv");
    expect(await ensureGcat(dir, "2026-10-22", page)).toEqual({ stamp: { fetchedOn: "2026-10-22" }, refreshed: false });
    expect(fetches).toBe(2);
    const failing = async (): Promise<string> => { throw new Error("down"); };
    expect(await ensureGcat(dir, "2026-10-23", failing)).toEqual({ stamp: { fetchedOn: "2026-10-22" }, refreshed: false });
    await expect(ensureGcat(fresh(), "2026-10-23", failing)).rejects.toThrow("down");
  });
});
