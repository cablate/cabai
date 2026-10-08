import { describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "./setup";

const databaseUrl = "postgresql://test:test@localhost:5432/cab_ai_test";
const confirmation = { TEST_DATABASE_RESET_CONFIRM: "cab_ai_test" };

describe("test database safety guard", () => {
  it("rejects a missing DATABASE_URL", () => {
    expect(() => requireTestDatabaseUrl({})).toThrow("DATABASE_URL not set");
  });
  it.each([
    "postgresql://test:test@localhost:5432/cab_ai",
    "postgresql://user_test:password@localhost:5432/production",
    "postgresql://user:password@host_test.example.com/production",
    "postgresql://user:password@localhost/production?application_name=_test",
    "postgresql://user:password@db.example.com/cab_ai_test",
    "postgresql://user:password@localhost/cab_ai_test?host=db.example.com",
    "postgresql://user:password@localhost/cab_ai_test?database=production",
    "postgresql://user:password@localhost/cab_ai_test#ignored",
    "postgresql://user:password@localhost/%63ab_ai_test",
    "postgresql://user:password@localhost/cab_ai_test/production",
    "https://localhost/cab_ai_test",
    "invalid-url",
  ])("rejects unsafe targets without exposing their values: %s", (url) => {
    expect(() => requireTestDatabaseUrl({ ...confirmation, DATABASE_URL: url })).toThrow("Safety:");
    try { requireTestDatabaseUrl({ ...confirmation, DATABASE_URL: url }); }
    catch (error) { expect(String(error)).not.toContain(url); }
  });
  it.each([undefined, "true", "other_test"])("requires exact disposable-target confirmation: %s", (value) => {
    expect(() => requireTestDatabaseUrl({ DATABASE_URL: databaseUrl, TEST_DATABASE_RESET_CONFIRM: value })).toThrow("TEST_DATABASE_RESET_CONFIRM");
  });
  it.each(["localhost", "127.0.0.1", "[::1]"])("accepts explicitly confirmed loopback %s", (host) => {
    const url = databaseUrl.replace("localhost", host);
    expect(requireTestDatabaseUrl({ ...confirmation, DATABASE_URL: url }, url)).toBe(url);
  });
  it("rejects a pool initialized with another target even if env is later changed", () => {
    expect(() => requireTestDatabaseUrl({ ...confirmation, DATABASE_URL: databaseUrl }, "postgresql://test:test@localhost/production")).toThrow("pool does not match");
  });
});
