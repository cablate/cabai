import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalEnabled = process.env.RELIABILITY_TESTS_ENABLED;
const originalCronSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.RELIABILITY_TESTS_ENABLED;
  else process.env.RELIABILITY_TESTS_ENABLED = originalEnabled;
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

describe("API reliability failure injection", () => {
  it("is unavailable unless explicitly enabled", async () => {
    delete process.env.RELIABILITY_TESTS_ENABLED;
    const response = await GET(new Request("https://cabai.example/api/reliability-test/error"));
    expect(response.status).toBe(404);
  });

  it("requires operator authentication and returns the normal JSON 500 contract", async () => {
    process.env.RELIABILITY_TESTS_ENABLED = "true";
    process.env.CRON_SECRET = "reliability-contract-secret";

    const unauthorized = await GET(new Request("https://cabai.example/api/reliability-test/error"));
    expect(unauthorized.status).toBe(401);

    const response = await GET(new Request("https://cabai.example/api/reliability-test/error", {
      headers: { authorization: "Bearer reliability-contract-secret" },
    }));
    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    await expect(response.json()).resolves.toEqual({
      error: "這是可靠性測試預期中的錯誤。",
      code: "INTERNAL_ERROR",
    });
  });
});
