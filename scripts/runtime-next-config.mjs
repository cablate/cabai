export class RuntimeNextConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuntimeNextConfigError";
    this.code = code;
  }
}

export function canonicalServerActionHost(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new RuntimeNextConfigError(
      "CANONICAL_APP_URL_INVALID",
      "NEXT_PUBLIC_APP_URL must be an absolute HTTP(S) origin.",
    );
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:")
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new RuntimeNextConfigError(
      "CANONICAL_APP_URL_INVALID",
      "NEXT_PUBLIC_APP_URL must contain only an HTTP(S) scheme and host.",
    );
  }

  return url.host;
}

export function withRuntimeServerActionOrigin(bakedConfig, appUrl) {
  if (!bakedConfig || typeof bakedConfig !== "object" || Array.isArray(bakedConfig)) {
    throw new RuntimeNextConfigError(
      "NEXT_CONFIG_INVALID",
      "The baked Next.js runtime configuration is invalid.",
    );
  }

  const canonicalHost = canonicalServerActionHost(appUrl);
  const experimental = bakedConfig.experimental && typeof bakedConfig.experimental === "object"
    ? bakedConfig.experimental
    : {};
  const serverActions = experimental.serverActions && typeof experimental.serverActions === "object"
    ? experimental.serverActions
    : {};
  const existingAllowedOrigins = Array.isArray(serverActions.allowedOrigins)
    ? serverActions.allowedOrigins.filter((origin) => typeof origin === "string" && origin.length > 0)
    : [];

  return {
    ...bakedConfig,
    experimental: {
      ...experimental,
      serverActions: {
        ...serverActions,
        allowedOrigins: [...new Set([...existingAllowedOrigins, canonicalHost])],
      },
    },
  };
}
