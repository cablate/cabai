import { describe, expect, it } from "vitest";
import { cleanTestData } from "./helpers";

describe("integration database cleanup", () => {
  it("completes without blocking on database file synchronization", async () => {
    const startedAt = performance.now();
    await cleanTestData();
    expect(performance.now() - startedAt).toBeLessThan(5_000);
  });
});
