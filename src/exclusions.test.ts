import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ExclusionRules, readExclusions, type Body } from "./exclusions.ts";

const data = readExclusions(JSON.parse(readFileSync(new URL("../data/exclusions.json", import.meta.url), "utf8")));
const rules = new ExclusionRules(data);
const t = Date.parse("2026-10-16T12:00:00Z");
const body = (over: Partial<Body>): Body => ({ number: 1, name: "X", launchTag: "2026-083", kind: "payload", launchedOn: "2026-04-16", owner: "VVKOV", ownerState: "RU", ownerDefence: true, ...over });
const seen = (b: Body | undefined, designator: string | null = null, firstSeenMs: number | null = null) => ({ body: b, designator, firstSeenMs });

describe("the exclusions", () => {
  it("reads the shipped file", () => {
    expect(data.dispersingDays).toBe(90);
    expect(data.ownerGroups.OneWeb).toContain("ONEWEBN");
  });
  it("refuses a malformed file", () => {
    expect(() => readExclusions({ ...data, visitorNames: ["("] })).toThrow();
    expect(() => readExclusions({ ...data, dispersingDays: "x" })).toThrow();
  });
  it("leaves out a pair of one launch, by the catalogue or by the designator", () => {
    expect(rules.exclusionOf(seen(body({ number: 1 })), seen(body({ number: 2, owner: "ICEUS", ownerState: "US", ownerDefence: false })), t)).toBe("same launch");
    expect(rules.exclusionOf(seen(undefined, "2026-083A"), seen(undefined, "2026-083B"), t)).toBe("same launch");
  });
  it("leaves out a pair of one owner: one code, one group, or two defence owners of one state", () => {
    const other = { launchTag: "2024-043", launchedOn: "2024-03-04" };
    expect(rules.exclusionOf(seen(body({})), seen(body({ ...other, owner: "VVKOV" })), t)).toBe("same owner");
    expect(rules.exclusionOf(seen(body({ owner: "ONEWEBE", ownerDefence: false, ownerState: "UK" })), seen(body({ ...other, owner: "ONEWEB", ownerDefence: false, ownerState: "UK" })), t)).toBe("same owner");
    expect(rules.exclusionOf(seen(body({ owner: "TSVS" })), seen(body({ ...other, owner: "TSKHM" })), t)).toBe("same owner");
    expect(rules.exclusionOf(seen(body({ owner: "VVKOV" })), seen(body({ ...other, owner: "ICEUS", ownerState: "US", ownerDefence: false })), t)).toBeNull();
  });
  it("leaves out a station and its visitors, by launch or by GCAT's names", () => {
    const old = { launchTag: "2010-010", launchedOn: "2010-03-01", owner: "A", ownerState: "X", ownerDefence: false };
    const another = { ...old, launchTag: "2011-011", owner: "B" };
    expect(rules.exclusionOf(seen(body({ ...old, launchTag: "1998-067", name: "Zarya" })), seen(body({ ...another, name: "Y" })), t)).toBe("station visitor");
    expect(rules.exclusionOf(seen(body({ ...old, name: "S.S. Steven R. Nagel" })), seen(body(another)), t)).toBe("station visitor");
    expect(rules.exclusionOf(seen(body({ ...old, name: "Progress MS-33" })), seen(body(another)), t)).toBe("station visitor");
    expect(rules.exclusionOf(seen(body({ ...old, name: "Plain" })), seen(body(another)), t)).toBeNull();
  });
  it("leaves out a stack still dispersing, and reads a temporary number as young", () => {
    const young = { launchTag: "2026-200", launchedOn: "2026-09-20", owner: "A", ownerState: "X", ownerDefence: false };
    expect(rules.exclusionOf(seen(body({ ...young })), seen(body({ ...young, launchTag: "2026-201", owner: "B" })), t)).toBe("dispersing stack");
    expect(rules.exclusionOf(seen(body({ ...young, launchedOn: "2025-01-01" })), seen(body({ ...young, launchTag: "2026-201", owner: "B" })), t)).toBeNull();
    expect(rules.exclusionOf(seen(undefined, null, null), seen(undefined, null, null), t)).toBe("dispersing stack");
    expect(rules.exclusionOf(seen(undefined, "2026-200A", t - 10 * 86_400_000), seen(undefined, "2026-201B", t - 20 * 86_400_000), t)).toBe("dispersing stack");
  });
  it("leaves out a fragment on either side, by GCAT's type, and keeps a rocket body, a component and an unknown number", () => {
    const other = { launchTag: "2019-001", launchedOn: "2019-01-01", owner: "B", ownerState: "X", ownerDefence: false };
    expect(rules.exclusionOf(seen(body({})), seen(body({ ...other, kind: "debris" })), t)).toBe("fragment");
    expect(rules.exclusionOf(seen(body({ kind: "debris" })), seen(body({ ...other })), t)).toBe("fragment");
    expect(rules.exclusionOf(seen(undefined, "2026-200A", t - 400 * 86_400_000), seen(body({ ...other, kind: "debris" })), t)).toBe("fragment");
    expect(rules.exclusionOf(seen(body({})), seen(body({ ...other, kind: "rocket body" })), t)).toBeNull();
    expect(rules.exclusionOf(seen(body({})), seen(body({ ...other, kind: "component" })), t)).toBeNull();
    expect(rules.exclusionOf(seen(body({})), seen(undefined, "2019-001A", t - 400 * 86_400_000), t)).toBeNull();
  });
  it("reads one object under two numbers from the geometry", () => {
    expect(rules.duplicate(0.2, 0.01)).toBe(true);
    expect(rules.duplicate(0.2, 0.3)).toBe(false);
    expect(rules.duplicate(null, 0)).toBe(false);
  });
});
