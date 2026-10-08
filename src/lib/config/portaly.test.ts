import { describe, expect, it } from "vitest";
import { inspectPortalyConfig, resolvePortalyConfig } from "./portaly";

describe("Portaly runtime configuration", () => {
  it("keeps payment disabled when no credential family is configured", () => {
    expect(inspectPortalyConfig({ PORTALY_MODE: "test" })).toEqual({
      state: "disabled",
      mode: "test",
      credentialSource: undefined,
      requireLive: false,
      missing: [],
      notes: [],
    });
  });

  it.each([
    {
      mode: "test",
      key: "pcs_test_example",
      keyName: "PORTALY_TEST_API_KEY",
      secretName: "PORTALY_TEST_CALLBACK_SECRET",
    },
    {
      mode: "live",
      key: "pcs_live_example",
      keyName: "PORTALY_LIVE_API_KEY",
      secretName: "PORTALY_LIVE_CALLBACK_SECRET",
    },
  ] as const)("accepts a complete legacy $mode credential family", ({ mode, key, keyName, secretName }) => {
    const result = resolvePortalyConfig({
      PORTALY_MODE: mode,
      [keyName]: key,
      [secretName]: "matching-callback-secret",
      PORTALY_PROFILE_ID: "profile-id",
    });

    expect(result).toMatchObject({
      state: "enabled",
      mode,
      credentialSource: "legacy",
      apiKey: key,
      callbackSecret: "matching-callback-secret",
      profileId: "profile-id",
      missing: [],
      notes: [],
    });
  });

  it("accepts unified live credentials without a profile id", () => {
    expect(resolvePortalyConfig({
      PORTALY_MODE: "live",
      PORTALY_API_KEY: "pcs_live_example",
      PORTALY_CALLBACK_SECRET: "matching-callback-secret",
    })).toMatchObject({
      state: "enabled",
      mode: "live",
      credentialSource: "unified",
      profileId: undefined,
    });
  });

  it("rejects an implicit or invalid mode instead of defaulting to live", () => {
    const missing = inspectPortalyConfig({
      PORTALY_API_KEY: "pcs_live_example",
      PORTALY_CALLBACK_SECRET: "matching-callback-secret",
    });
    const invalid = inspectPortalyConfig({
      PORTALY_MODE: "production",
      PORTALY_API_KEY: "pcs_live_example",
      PORTALY_CALLBACK_SECRET: "matching-callback-secret",
    });

    expect(missing).toMatchObject({ state: "misconfigured", missing: ["PORTALY_MODE"] });
    expect(invalid).toMatchObject({ state: "misconfigured", mode: undefined });
  });

  it("rejects mode and API-key prefix mismatches", () => {
    const result = inspectPortalyConfig({
      PORTALY_MODE: "live",
      PORTALY_API_KEY: "pcs_test_example",
      PORTALY_CALLBACK_SECRET: "matching-callback-secret",
    });

    expect(result).toMatchObject({ state: "misconfigured", mode: "live" });
    expect(result.notes).toContain("PORTALY_MODE does not match the selected Portaly API key prefix.");
  });

  it("rejects test mode when the deployment explicitly requires live payment", () => {
    const result = inspectPortalyConfig({
      PORTALY_MODE: "test",
      PORTALY_TEST_API_KEY: "pcs_test_example",
      PORTALY_TEST_CALLBACK_SECRET: "matching-callback-secret",
      PORTALY_PROFILE_ID: "profile-id",
      PORTALY_REQUIRE_LIVE: "true",
    });

    expect(result).toMatchObject({ state: "misconfigured", requireLive: true });
    expect(result.notes).toContain(
      "PORTALY_REQUIRE_LIVE forbids test-mode checkout in this deployment.",
    );
  });

  it("rejects an invalid require-live selector even when payment is otherwise disabled", () => {
    expect(inspectPortalyConfig({ PORTALY_REQUIRE_LIVE: "yes" })).toMatchObject({
      state: "misconfigured",
      notes: ["PORTALY_REQUIRE_LIVE must be true or false when configured."],
    });
  });

  it("rejects ambiguous unified and legacy credential families without exposing values", () => {
    const result = inspectPortalyConfig({
      PORTALY_MODE: "live",
      PORTALY_API_KEY: "pcs_live_unified-private",
      PORTALY_CALLBACK_SECRET: "unified-private-secret",
      PORTALY_LIVE_API_KEY: "pcs_live_legacy-private",
      PORTALY_LIVE_CALLBACK_SECRET: "legacy-private-secret",
      PORTALY_PROFILE_ID: "private-profile",
    });
    const serialized = JSON.stringify(result);

    expect(result.state).toBe("misconfigured");
    expect(serialized).not.toContain("private");
  });
});
