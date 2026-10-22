import { describe, expect, it } from "vitest";
import { failureBody, failureTarget } from "./failure-issue.ts";
import { toReenable } from "./keep-alive.ts";

describe("a failed run's issue", () => {
  it("comments on the open issue of the same title and opens one otherwise", () => {
    const issues = [{ number: 3, title: "The live run failed on 2026-10-22", body: "", state: "OPEN", url: "" }, { number: 2, title: "The live run failed on 2026-10-21", body: "", state: "CLOSED", url: "" }];
    expect(failureTarget("The live run failed on 2026-10-22", issues)).toBe(3);
    expect(failureTarget("The live run failed on 2026-10-21", issues)).toBeNull();
  });
  it("carries the end of each log in a fence and says when a log was never written", () => {
    const body = failureBody("The run failed.", [{ name: "run.log", text: "a\nb```c\n" }, { name: "live.log", text: null }]);
    expect(body).toContain("The end of run.log:\n\n```text\na\nb'''c\n```");
    expect(body).toContain("live.log: (no log)");
    const long = failureBody("x", [{ name: "l", text: "y".repeat(70_000) }]);
    expect(long.length).toBeLessThan(61_000);
    expect(long).toContain("…");
  });
});

describe("the keep-alive", () => {
  it("enables again only the workflows GitHub disabled for inactivity", () => {
    const listed = [{ id: 1, name: "Live", path: ".github/workflows/live.yml", state: "disabled_inactivity" }, { id: 2, name: "CI", path: ".github/workflows/ci.yml", state: "active" }, { id: 3, name: "Pages", path: ".github/workflows/docs.yml", state: "disabled_manually" }];
    expect(toReenable(listed).map((w) => w.id)).toEqual([1]);
  });
});
