export type PortalyMode = "test" | "live";
export type PortalyCredentialSource = "unified" | "legacy";
export type PortalyConfigState = "disabled" | "enabled" | "misconfigured";

export type PortalyEnvironment = Record<string, string | undefined>;

export interface PortalyConfigResolution {
  state: PortalyConfigState;
  mode?: PortalyMode;
  credentialSource?: PortalyCredentialSource;
  apiKey?: string;
  callbackSecret?: string;
  profileId?: string;
  requireLive: boolean;
  missing: string[];
  notes: string[];
}

export interface PortalyConfigInspection {
  state: PortalyConfigState;
  mode?: PortalyMode;
  credentialSource?: PortalyCredentialSource;
  requireLive: boolean;
  missing: string[];
  notes: string[];
}

const UNIFIED_KEYS = ["PORTALY_API_KEY", "PORTALY_CALLBACK_SECRET"] as const;
const LEGACY_CREDENTIAL_KEYS = [
  "PORTALY_LIVE_API_KEY",
  "PORTALY_LIVE_CALLBACK_SECRET",
  "PORTALY_TEST_API_KEY",
  "PORTALY_TEST_CALLBACK_SECRET",
] as const;

function value(env: PortalyEnvironment, key: string): string | undefined {
  return env[key]?.trim() || undefined;
}

function hasAny(env: PortalyEnvironment, keys: readonly string[]): boolean {
  return keys.some((key) => Boolean(value(env, key)));
}

function apiKeyMode(apiKey: string | undefined): PortalyMode | undefined {
  if (apiKey?.startsWith("pcs_live_")) return "live";
  if (apiKey?.startsWith("pcs_test_")) return "test";
  return undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function resolvePortalyConfig(
  env: PortalyEnvironment = process.env,
): PortalyConfigResolution {
  const missing: string[] = [];
  const notes: string[] = [];
  const rawMode = value(env, "PORTALY_MODE");
  const mode = rawMode === "test" || rawMode === "live" ? rawMode : undefined;
  const rawRequireLive = value(env, "PORTALY_REQUIRE_LIVE");
  const requireLive = rawRequireLive === "true";
  const unifiedConfigured = hasAny(env, UNIFIED_KEYS);
  const legacyConfigured = hasAny(env, LEGACY_CREDENTIAL_KEYS);
  const profileConfigured = Boolean(value(env, "PORTALY_PROFILE_ID"));
  const configured = unifiedConfigured || legacyConfigured || profileConfigured || requireLive;

  if (!configured) {
    if (rawRequireLive && rawRequireLive !== "true" && rawRequireLive !== "false") {
      return {
        state: "misconfigured",
        mode,
        requireLive,
        missing: [],
        notes: ["PORTALY_REQUIRE_LIVE must be true or false when configured."],
      };
    }
    return {
      state: "disabled",
      mode,
      requireLive,
      missing: [],
      notes: [],
    };
  }

  if (!rawMode) {
    missing.push("PORTALY_MODE");
    notes.push("PORTALY_MODE must explicitly select test or live when payment is configured.");
  } else if (!mode) {
    notes.push("PORTALY_MODE must be exactly test or live.");
  }

  if (rawRequireLive && rawRequireLive !== "true" && rawRequireLive !== "false") {
    notes.push("PORTALY_REQUIRE_LIVE must be true or false when configured.");
  }

  const credentialSource: PortalyCredentialSource = unifiedConfigured ? "unified" : "legacy";
  if (unifiedConfigured && legacyConfigured) {
    notes.push(
      "Unified and legacy Portaly credentials cannot be configured together because unified credentials take precedence.",
    );
  }

  let apiKey: string | undefined;
  let callbackSecret: string | undefined;
  let profileId: string | undefined;

  if (credentialSource === "unified") {
    apiKey = value(env, "PORTALY_API_KEY");
    callbackSecret = value(env, "PORTALY_CALLBACK_SECRET");
    if (!apiKey) missing.push("PORTALY_API_KEY");
    if (!callbackSecret) missing.push("PORTALY_CALLBACK_SECRET");
  } else if (mode) {
    const apiKeyName = mode === "live" ? "PORTALY_LIVE_API_KEY" : "PORTALY_TEST_API_KEY";
    const callbackSecretName = mode === "live"
      ? "PORTALY_LIVE_CALLBACK_SECRET"
      : "PORTALY_TEST_CALLBACK_SECRET";
    apiKey = value(env, apiKeyName);
    callbackSecret = value(env, callbackSecretName);
    profileId = value(env, "PORTALY_PROFILE_ID");
    if (!apiKey) missing.push(apiKeyName);
    if (!callbackSecret) missing.push(callbackSecretName);
    if (!profileId) missing.push("PORTALY_PROFILE_ID");
  }

  if (apiKey && !apiKeyMode(apiKey)) {
    notes.push("The selected Portaly API key must start with pcs_test_ or pcs_live_.");
  } else if (apiKey && mode && apiKeyMode(apiKey) !== mode) {
    notes.push("PORTALY_MODE does not match the selected Portaly API key prefix.");
  }

  if (requireLive && mode !== "live") {
    notes.push("PORTALY_REQUIRE_LIVE forbids test-mode checkout in this deployment.");
  }

  const invalid = missing.length > 0 || notes.length > 0;
  return {
    state: invalid ? "misconfigured" : "enabled",
    mode,
    credentialSource,
    apiKey,
    callbackSecret,
    profileId,
    requireLive,
    missing: unique(missing),
    notes,
  };
}

export function inspectPortalyConfig(
  env: PortalyEnvironment = process.env,
): PortalyConfigInspection {
  const resolution = resolvePortalyConfig(env);
  return {
    state: resolution.state,
    mode: resolution.mode,
    credentialSource: resolution.credentialSource,
    requireLive: resolution.requireLive,
    missing: resolution.missing,
    notes: resolution.notes,
  };
}
