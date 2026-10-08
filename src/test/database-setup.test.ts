import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "./database-setup";

describe("integration command timeout", () => {
  it("terminates a child process and rejects with actionable context", async () => {
    const startedAt = Date.now();

    await expect(
      runCommandWithTimeout(
        process.execPath,
        ["-e", "setInterval(() => {}, 1000)"],
        {
          cwd: process.cwd(),
          env: process.env,
          timeoutMs: 100,
          displayCommand: "node <timeout-fixture>",
        },
      ),
    ).rejects.toThrow("Command exceeded 100ms and was terminated");

    expect(Date.now() - startedAt).toBeLessThan(10_000);
  }, 15_000);
});
