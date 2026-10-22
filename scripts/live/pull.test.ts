import { describe, expect, it } from "vitest";
import { DAY_MS, HOUR_MS } from "../../src/elements.ts";
import { chunksOf, latestCreated, sinceQuery, stamp } from "./pull.ts";

describe("the live run's pull", () => {
  it("reads an hour in one chunk and a gap of days a day at a time, the last chunk ending now", () => {
    const t0 = Date.parse("2026-10-22T10:00:00Z");
    expect(chunksOf(t0, t0 + HOUR_MS)).toEqual([{ fromMs: t0, toMs: t0 + HOUR_MS }]);
    const chunks = chunksOf(t0, t0 + 2 * DAY_MS + HOUR_MS);
    expect(chunks).toHaveLength(3);
    expect(chunks[2]).toEqual({ fromMs: t0 + 2 * DAY_MS, toMs: t0 + 2 * DAY_MS + HOUR_MS });
    expect(chunksOf(t0, t0)).toEqual([]);
  });
  it("spells the range as the catalogue reads it, by publication time, in publication order", () => {
    expect(stamp(Date.parse("2026-10-22T10:00:05.123Z"))).toBe("2026-10-22%2010:00:05");
    const q = sinceQuery(Date.parse("2026-10-22T10:00:00Z"), Date.parse("2026-10-22T11:00:00Z"));
    expect(q).toContain("/class/gp_history/CREATION_DATE/2026-10-22%2010:00:00--2026-10-22%2011:00:00/orderby/CREATION_DATE%20asc,GP_ID%20asc/");
    expect(q).toContain("CREATION_DATE,GP_ID/format/json");
  });
  it("reads the latest publication time from the rows", () => {
    expect(latestCreated([])).toBeNull();
    expect(latestCreated([{ NORAD_CAT_ID: "1", EPOCH: "2026-10-22T09:00:00", CREATION_DATE: "2026-10-22 10:20:00" }, { NORAD_CAT_ID: "2", EPOCH: "2026-10-22T09:00:00", CREATION_DATE: "2026-10-22 10:05:00" }])).toBe(Date.parse("2026-10-22T10:20:00Z"));
  });
});
