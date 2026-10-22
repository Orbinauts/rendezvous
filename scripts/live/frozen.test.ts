import { describe, expect, it } from "vitest";
import { checkTagged, FROZEN_COMMIT, FROZEN_DETECTOR, FROZEN_PINS, pinsMismatch } from "./frozen.ts";
import { DETECTOR_NAME } from "../../src/detector.ts";

describe("the frozen detector", () => {
  it("is this branch's detector by name, with its one runtime dependency pinned", () => {
    expect(FROZEN_DETECTOR).toBe(DETECTOR_NAME);
    expect(FROZEN_PINS).toEqual({ "satellite.js": "7.1.0" });
    expect(FROZEN_COMMIT).toMatch(/^[0-9a-f]{40}$/);
  });
  it("refuses a moved tag and a dependency at another version", () => {
    expect(() => checkTagged(FROZEN_COMMIT)).not.toThrow();
    expect(() => checkTagged("0".repeat(40))).toThrow(/moved tag/);
    expect(pinsMismatch({ "satellite.js": "7.1.0" })).toBeNull();
    expect(pinsMismatch({ "satellite.js": "7.2.0" })).toMatch(/7\.2\.0.*not 7\.1\.0/);
    expect(pinsMismatch({ "satellite.js": null })).toMatch(/not installed/);
  });
});
