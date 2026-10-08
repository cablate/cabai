import { describe, expect, it } from "vitest";
import {
  hasBlockingConfigErrors,
  hasDegradedConfigErrors,
  inspectPlatformConfig,
  resolveBackupProvider,
  type Environment,
} from "./platform";

const core: Environment = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/course_platform",
  AUTH_SECRET: "test-secret-with-enough-entropy-32",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

describe("inspectPlatformConfig", () => {
  it("platform config / minimal self-host / enables local storage", () => {
    const result = inspectPlatformConfig(core);

    expect(result.capabilities.storage).toMatchObject({ state: "enabled", provider: "local" });
    expect(result.capabilities.backup.state).toBe("disabled");
    expect(result.capabilities.payment).toMatchObject({ state: "disabled", provider: "portaly" });
    expect(result.capabilities.agentApi).toMatchObject({ state: "enabled", provider: "database" });
    expect(result.capabilities.observability).toMatchObject({ state: "disabled", provider: "sentry" });
    expect(hasBlockingConfigErrors(result)).toBe(false);
  });

  it("platform config / unified Portaly setup / derives the profile from the API key", () => {
    const result = inspectPlatformConfig({
      ...core,
      PORTALY_MODE: "test",
      PORTALY_API_KEY: "pcs_test_example",
      PORTALY_CALLBACK_SECRET: "callback-secret",
    });

    expect(result.capabilities.payment).toMatchObject({
      state: "enabled",
      missing: [],
    });
    expect(hasBlockingConfigErrors(result)).toBe(false);
  });

  it.each([
    {
      name: "live",
      env: {
        PORTALY_MODE: "live",
        PORTALY_LIVE_API_KEY: "pcs_live_example",
        PORTALY_LIVE_CALLBACK_SECRET: "live-callback-secret",
        PORTALY_PROFILE_ID: "profile-id",
      },
    },
    {
      name: "test",
      env: {
        PORTALY_MODE: "test",
        PORTALY_TEST_API_KEY: "pcs_test_example",
        PORTALY_TEST_CALLBACK_SECRET: "test-callback-secret",
        PORTALY_PROFILE_ID: "profile-id",
      },
    },
  ])("platform config / complete legacy Portaly $name setup / remains enabled", ({ env }) => {
    const result = inspectPlatformConfig({ ...core, ...env });

    expect(result.capabilities.payment).toMatchObject({
      state: "enabled",
      provider: "portaly",
      missing: [],
    });
    expect(hasBlockingConfigErrors(result)).toBe(false);
  });

  it("platform config / Discord OAuth setup / requires the redirect URI", () => {
    const result = inspectPlatformConfig({
      ...core,
      DISCORD_CLIENT_ID: "client-id",
      DISCORD_CLIENT_SECRET: "client-secret",
      DISCORD_BOT_TOKEN: "bot-token",
      DISCORD_GUILD_ID: "guild-id",
    });

    expect(result.capabilities.discord).toMatchObject({
      state: "misconfigured",
      missing: ["DISCORD_REDIRECT_URI"],
    });
  });

  it("platform config / partial Sentry setup / reports the enabled surface without requiring both DSNs", () => {
    const result = inspectPlatformConfig({ ...core, SENTRY_DSN: "https://public@example.invalid/1" });

    expect(result.capabilities.observability).toMatchObject({
      state: "enabled",
      provider: "sentry",
      notes: ["Browser capture is disabled."],
    });
    expect(hasBlockingConfigErrors(result)).toBe(false);
  });

  it("platform config / partial Portaly setup / reports a blocking payment diagnostic", () => {
    const result = inspectPlatformConfig({
      ...core,
      PORTALY_MODE: "live",
      PORTALY_LIVE_API_KEY: "pcs_live_example",
    });

    expect(result.capabilities.payment).toMatchObject({
      state: "misconfigured",
      missing: ["PORTALY_LIVE_CALLBACK_SECRET", "PORTALY_PROFILE_ID"],
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: "error", key: "payment" }),
    ]));
    expect(hasBlockingConfigErrors(result)).toBe(true);
  });

  it("platform config / explicit R2 missing a secret / reports misconfigured without values", () => {
    const result = inspectPlatformConfig({
      ...core,
      STORAGE_PROVIDER: "r2",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      CLOUDFLARE_R2_ACCESS_KEY_ID: "access-id",
      CLOUDFLARE_R2_BUCKET_NAME: "course-assets",
    });

    expect(result.capabilities.storage).toMatchObject({
      state: "misconfigured",
      missing: ["CLOUDFLARE_R2_SECRET_ACCESS_KEY"],
    });
    expect(JSON.stringify(result)).not.toContain("account-id");
  });

  it("platform config / legacy R2 variables / infers R2 for compatibility", () => {
    const result = inspectPlatformConfig({
      ...core,
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      CLOUDFLARE_R2_ACCESS_KEY_ID: "access-id",
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret",
      CLOUDFLARE_R2_BUCKET_NAME: "course-assets",
    });

    expect(result.capabilities.storage).toMatchObject({ state: "enabled", provider: "r2" });
  });

  it("platform config / invalid core values / blocks startup diagnostics", () => {
    const result = inspectPlatformConfig({
      DATABASE_URL: "file:local.db",
      AUTH_SECRET: "",
      NEXT_PUBLIC_APP_URL: "javascript:alert(1)",
    });

    expect(hasBlockingConfigErrors(result)).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.key)).toEqual(
      expect.arrayContaining(["DATABASE_URL", "AUTH_SECRET", "NEXT_PUBLIC_APP_URL"]),
    );
  });

  it("platform config / invalid public identity / blocks without echoing the value", () => {
    const result = inspectPlatformConfig({
      ...core,
      CONTACT_EMAIL: "private-invalid-value",
    });

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: "error", key: "CONTACT_EMAIL" }),
    ]));
    expect(JSON.stringify(result.diagnostics)).not.toContain("private-invalid-value");
  });

  it("platform config / incomplete backup / degrades without blocking core startup", () => {
    const result = inspectPlatformConfig({
      ...core,
      DB_BACKUP_WRITES_ENABLED: "true",
      BACKUP_PROVIDER: "r2",
      STORAGE_PROVIDER: "local",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
    });

    expect(result.capabilities.backup).toMatchObject({
      state: "misconfigured",
      provider: "r2",
      missing: expect.arrayContaining([
        "CLOUDFLARE_R2_ACCESS_KEY_ID",
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
        "CLOUDFLARE_R2_BACKUP_BUCKET_NAME",
      ]),
    });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      key: "backup",
      level: "error",
      impact: "degraded",
    }));
    expect(hasBlockingConfigErrors(result)).toBe(false);
    expect(hasDegradedConfigErrors(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("account-id");
  });

  it.each(["abc", "0", "-5", "2", "3.5"])(
    "platform config / backup retention %s / degrades before runtime deletion",
    (value) => {
      const result = inspectPlatformConfig({
        ...core,
        DB_BACKUP_WRITES_ENABLED: "true",
        BACKUP_PROVIDER: "local",
        DB_BACKUP_KEEP: value,
      });

      expect(result.capabilities.backup).toMatchObject({
        state: "misconfigured",
        provider: "local",
      });
      expect(result.diagnostics).toContainEqual(expect.objectContaining({
        key: "backup",
        impact: "degraded",
      }));
    },
  );

  it.each([
    {
      name: "disabled by default",
      env: {},
      expected: { state: "disabled", provider: "disabled", writeEnabled: false },
    },
    {
      name: "requires an explicit provider when writes are enabled",
      env: { DB_BACKUP_WRITES_ENABLED: "true" },
      expected: { state: "misconfigured", provider: "disabled", missing: ["BACKUP_PROVIDER"] },
    },
    {
      name: "supports an explicit local writer",
      env: { DB_BACKUP_WRITES_ENABLED: "true", BACKUP_PROVIDER: "local" },
      expected: { state: "enabled", provider: "local", writeEnabled: true },
    },
    {
      name: "requires the dedicated private R2 backup bucket",
      env: {
        DB_BACKUP_WRITES_ENABLED: "true",
        BACKUP_PROVIDER: "r2",
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_R2_ACCESS_KEY_ID: "access",
        CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret",
      },
      expected: { state: "misconfigured", provider: "r2", missing: ["CLOUDFLARE_R2_BACKUP_BUCKET_NAME"] },
    },
  ])("backup resolver / $name", ({ env, expected }) => {
    expect(resolveBackupProvider(env)).toMatchObject(expected);
  });
});
