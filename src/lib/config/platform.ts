import { z } from "zod";
import { inspectSiteIdentity, type SiteIdentity } from "./site-identity";
import { inspectPortalyConfig } from "./portaly";
import { parseBackupRetention } from "@/lib/database-backup/retention";

export type Environment = Record<string, string | undefined>;
export type CapabilityState = "enabled" | "disabled" | "misconfigured";
export type OperationalImpact = "fatal" | "degraded" | "warning";

export interface CapabilityStatus {
  state: CapabilityState;
  provider?: string;
  missing: string[];
  notes: string[];
}

export interface ConfigDiagnostic {
  level: "error" | "warning" | "info";
  impact: OperationalImpact;
  key: string;
  message: string;
}

export interface BackupProviderResolution extends CapabilityStatus {
  provider: "disabled" | "local" | "r2";
  writeEnabled: boolean;
}

export interface PlatformConfigInspection {
  diagnostics: ConfigDiagnostic[];
  capabilities: {
    storage: CapabilityStatus;
    backup: CapabilityStatus;
    scheduledTasks: CapabilityStatus;
    discord: CapabilityStatus;
    agentApi: CapabilityStatus;
    payment: CapabilityStatus;
    observability: CapabilityStatus;
  };
  values: {
    appUrl?: string;
    storageProvider: "local" | "r2";
    backupProvider: "disabled" | "local" | "r2";
    localStoragePath: string;
    localBackupPath: string;
    siteIdentity: SiteIdentity;
  };
}

const httpUrlSchema = z.string().url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
  message: "must use http or https",
});

function present(env: Environment, key: string): boolean {
  return Boolean(env[key]?.trim());
}

function missingKeys(env: Environment, keys: string[]): string[] {
  return keys.filter((key) => !present(env, key));
}

function inferStorageProvider(env: Environment): "local" | "r2" {
  if (env.STORAGE_PROVIDER === "local" || env.STORAGE_PROVIDER === "r2") return env.STORAGE_PROVIDER;
  return ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_BUCKET_NAME"].some((key) => present(env, key))
    ? "r2"
    : "local";
}

export function resolveBackupProvider(env: Environment = process.env): BackupProviderResolution {
  const selected = env.BACKUP_PROVIDER?.trim();
  const writeEnabled = env.DB_BACKUP_WRITES_ENABLED === "true";
  if (!selected) {
    return writeEnabled
      ? {
          state: "misconfigured",
          provider: "disabled",
          writeEnabled,
          missing: ["BACKUP_PROVIDER"],
          notes: ["Backup writes require an explicit local or r2 provider."],
        }
      : {
          state: "disabled",
          provider: "disabled",
          writeEnabled,
          missing: [],
          notes: ["Backup writes are opt-in."],
        };
  }
  if (selected !== "disabled" && selected !== "local" && selected !== "r2") {
    return {
      state: "misconfigured",
      provider: "disabled",
      writeEnabled,
      missing: [],
      notes: ["BACKUP_PROVIDER must be disabled, local, or r2."],
    };
  }
  if (selected === "disabled") {
    return {
      state: writeEnabled ? "misconfigured" : "disabled",
      provider: selected,
      writeEnabled,
      missing: writeEnabled ? ["BACKUP_PROVIDER"] : [],
      notes: writeEnabled
        ? ["Select local or r2 when backup writes are enabled."]
        : ["Backup writes are disabled."],
    };
  }

  const missing = selected === "r2"
    ? missingKeys(env, [
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_R2_ACCESS_KEY_ID",
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
        "CLOUDFLARE_R2_BACKUP_BUCKET_NAME",
      ])
    : [];
  let retentionError: string | null = null;
  if (writeEnabled) {
    try {
      parseBackupRetention(env.DB_BACKUP_KEEP);
    } catch (error) {
      retentionError = error instanceof Error ? error.message : "DB_BACKUP_KEEP is invalid.";
    }
  }
  return {
    state: missing.length > 0 || retentionError ? "misconfigured" : writeEnabled ? "enabled" : "disabled",
    provider: selected,
    writeEnabled,
    missing,
    notes: retentionError
      ? [retentionError]
      : writeEnabled
        ? []
        : ["Backup writes are disabled; read and verification commands remain available."],
  };
}

function optionalIntegration(env: Environment, provider: string, required: string[]): CapabilityStatus {
  const configured = required.some((key) => present(env, key));
  if (!configured) return { state: "disabled", provider, missing: [], notes: [] };
  const missing = missingKeys(env, required);
  return {
    state: missing.length > 0 ? "misconfigured" : "enabled",
    provider,
    missing,
    notes: [],
  };
}

export function inspectPlatformConfig(env: Environment = process.env): PlatformConfigInspection {
  const diagnostics: ConfigDiagnostic[] = [];
  const siteIdentity = inspectSiteIdentity(env);

  diagnostics.push(...siteIdentity.issues.map((issue) => ({
    level: "error" as const,
    impact: "fatal" as const,
    key: issue.key,
    message: `Site identity configuration is invalid: ${issue.message}.`,
  })));

  if (!present(env, "DATABASE_URL")) {
    diagnostics.push({ level: "error", impact: "fatal", key: "DATABASE_URL", message: "PostgreSQL connection is required." });
  } else if (!env.DATABASE_URL!.startsWith("postgresql://") && !env.DATABASE_URL!.startsWith("postgres://")) {
    diagnostics.push({ level: "error", impact: "fatal", key: "DATABASE_URL", message: "Only PostgreSQL URLs are supported." });
  }

  if (!present(env, "AUTH_SECRET")) {
    diagnostics.push({ level: "error", impact: "fatal", key: "AUTH_SECRET", message: "Authentication secret is required." });
  } else if (env.AUTH_SECRET!.length < 32) {
    diagnostics.push({ level: "error", impact: "fatal", key: "AUTH_SECRET", message: "Authentication secret must be at least 32 characters." });
  }

  const rawAppUrl = env.NEXT_PUBLIC_APP_URL?.trim() || env.AUTH_URL?.trim() || env.NEXTAUTH_URL?.trim();
  const parsedAppUrl = rawAppUrl ? httpUrlSchema.safeParse(rawAppUrl) : null;
  if (!rawAppUrl) {
    diagnostics.push({ level: "error", impact: "fatal", key: "NEXT_PUBLIC_APP_URL", message: "A canonical application URL is required." });
  } else if (!parsedAppUrl?.success) {
    diagnostics.push({ level: "error", impact: "fatal", key: "NEXT_PUBLIC_APP_URL", message: "Application URL must be a valid HTTP(S) URL." });
  } else {
    const url = new URL(parsedAppUrl.data);
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      diagnostics.push({ level: "error", impact: "fatal", key: "NEXT_PUBLIC_APP_URL", message: "Application URL must contain only scheme and host." });
    }
  }

  const storageProvider = inferStorageProvider(env);
  const storageRequired = [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "CLOUDFLARE_R2_BUCKET_NAME",
  ];
  const storageMissing = storageProvider === "r2" ? missingKeys(env, storageRequired) : [];
  const storage: CapabilityStatus = {
    state: storageMissing.length > 0 ? "misconfigured" : "enabled",
    provider: storageProvider,
    missing: storageMissing,
    notes: storageProvider === "local" ? ["Use a persistent volume outside ephemeral deployments."] : [],
  };

  const backup = resolveBackupProvider(env);

  const scheduledTasks: CapabilityStatus = schedulerCapability(env);
  const discord = optionalIntegration(env, "discord", ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI", "DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"]);
  const agentApi: CapabilityStatus = {
    state: "enabled",
    provider: "database",
    missing: [],
    notes: ["Agent credentials are managed in the agent_api_keys table."],
  };
  const payment = portalyCapability(env);
  const observability = sentryCapability(env);

  for (const [key, status] of Object.entries({ storage, backup, scheduledTasks, discord, agentApi, payment, observability })) {
    if (status.state === "misconfigured") {
      const detail = status.missing.length > 0
        ? `missing: ${status.missing.join(", ")}`
        : status.notes.join(" ") || "configuration is invalid";
      diagnostics.push({
        level: "error",
        impact: key === "backup" || key === "scheduledTasks" ? "degraded" : "fatal",
        key,
        message: `Selected ${status.provider} capability is invalid (${detail}).`,
      });
    }
  }

  return {
    diagnostics,
    capabilities: { storage, backup, scheduledTasks, discord, agentApi, payment, observability },
    values: {
      ...(parsedAppUrl?.success ? { appUrl: new URL(parsedAppUrl.data).origin } : {}),
      storageProvider,
      backupProvider: backup.provider,
      localStoragePath: env.LOCAL_STORAGE_PATH?.trim() || "./data/storage",
      localBackupPath: env.LOCAL_BACKUP_PATH?.trim() || "./backups",
      siteIdentity: siteIdentity.value,
    },
  };
}

function portalyCapability(env: Environment): CapabilityStatus {
  const inspection = inspectPortalyConfig(env);
  return {
    state: inspection.state,
    provider: "portaly",
    missing: inspection.missing,
    notes: inspection.notes,
  };
}

function processBooleanCapability(value: string | undefined, provider: string): CapabilityStatus {
  if (value === "true") return { state: "enabled", provider, missing: [], notes: [] };
  if (value && value !== "false") {
    return { state: "misconfigured", provider, missing: [], notes: ["Expected true or false."] };
  }
  return { state: "disabled", provider, missing: [], notes: [] };
}

function sentryCapability(env: Environment): CapabilityStatus {
  const server = present(env, "SENTRY_DSN");
  const browser = present(env, "NEXT_PUBLIC_SENTRY_DSN");
  if (!server && !browser) {
    return { state: "disabled", provider: "sentry", missing: [], notes: ["Error monitoring is optional."] };
  }
  return {
    state: "enabled",
    provider: "sentry",
    missing: [],
    notes: server && browser
      ? []
      : [server ? "Browser capture is disabled." : "Server capture is disabled."],
  };
}

function schedulerCapability(env: Environment): CapabilityStatus {
  const explicit = env.SCHEDULER_MODE?.trim();
  if (explicit) {
    if (explicit === "disabled") return { state: "disabled", provider: explicit, missing: [], notes: [] };
    if (explicit === "in_process" || explicit === "external") {
      return { state: "enabled", provider: explicit, missing: [], notes: explicit === "external" ? ["Jobs must be invoked through authenticated cron routes."] : [] };
    }
    return { state: "misconfigured", provider: explicit, missing: [], notes: ["Expected disabled, in_process, or external."] };
  }
  return processBooleanCapability(env.SCHEDULED_TASKS_ENABLED, "in_process");
}

export function hasBlockingConfigErrors(inspection: PlatformConfigInspection): boolean {
  return inspection.diagnostics.some((diagnostic) => diagnostic.impact === "fatal");
}

export function hasDegradedConfigErrors(inspection: PlatformConfigInspection): boolean {
  return inspection.diagnostics.some((diagnostic) => diagnostic.impact === "degraded");
}

export function hasDeploymentConfigErrors(inspection: PlatformConfigInspection): boolean {
  return inspection.diagnostics.some((diagnostic) => diagnostic.impact === "fatal" || diagnostic.impact === "degraded");
}
