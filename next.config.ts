import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const isDevelopment = process.env.NODE_ENV === "development";

function getDevelopmentAllowedOrigins() {
  const origins = new Set<string>();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (appUrl) {
    try {
      origins.add(new URL(appUrl).hostname);
    } catch {
      // Ignore malformed local overrides; Next dev will still use defaults.
    }
  }

  return [...origins].filter(Boolean);
}

function getConfiguredAssetOrigin() {
  const value = process.env.NEXT_PUBLIC_ASSET_HOST || process.env.CLOUDFLARE_R2_PUBLIC_URL;
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return { hostname: url.hostname, origin: url.origin };
  } catch {
    return null;
  }
}

function getConfiguredSentryOrigin() {
  const value = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

const assetOrigin = getConfiguredAssetOrigin();
const sentryOrigin = getConfiguredSentryOrigin();

const nextConfig: NextConfig = {
  output: "standalone",
  ...(isDevelopment ? { allowedDevOrigins: getDevelopmentAllowedOrigins() } : {}),
  outputFileTracingRoot: path.resolve(__dirname),
  // Build artifacts must not carry operator secrets, logs, uploads or backups.
  // These are runtime-managed state, not standalone application dependencies.
  outputFileTracingExcludes: {
    "/*": ["./.git", "./.env", "./.env.*", "./logs/**/*", "./backups/**/*", "./data/storage/**/*", "./tmp/**/*", "./.git/**/*"],
  },
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "@phosphor-icons/react/dist/ssr"],
    sri: {
      algorithm: "sha256",
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [60, 75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      ...(assetOrigin ? [{ protocol: "https" as const, hostname: assetOrigin.hostname }] : []),
    ],
  },
  async headers() {
    // F-13: CSP moved from Report-Only to enforcing on 2026-05-26 after the
    // codebase audit confirmed zero XSS sinks (no dangerouslySetInnerHTML,
    // no innerHTML, no eval). What this policy enforces today vs. what's
    // still pending:
    //
    //   ENFORCED:
    //   - no 'unsafe-eval' (Next 16 production runtime doesn't need it)
    //   - upgrade-insecure-requests (any subresource forced to HTTPS)
    //   - frame-src 'none' (no embedded iframes)
    //   - worker-src 'self', manifest-src 'self'
    //
    //   STILL ALLOWED (`'unsafe-inline'` on script-src / style-src) because
    //   Next.js emits inline runtime + Tailwind injects styles. The proper
    //   fix is per-request nonce via middleware (Next 16 supports them)
    //   and that's tracked as F-13.2 in remediation-plan.md.
    //
    //   Sources whitelisted:
    //   - Google profile images (lh3.googleusercontent.com), the configured
    //     public asset origin, and R2 storage (*.r2.cloudflarestorage.com)
    //     for direct upload preview
    //   - OAuth (accounts.google.com) + Portaly checkout for form-action
    const scriptSrc = [
      "'self'",
      "'unsafe-inline'",
      "https://f.convertkit.com",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ].join(" ");
    const connectSrc = [
      "'self'",
      "https://accounts.google.com",
      "https://app.kit.com",
      "https://*.r2.cloudflarestorage.com",
      ...(sentryOrigin ? [sentryOrigin] : []),
      ...(isDevelopment ? ["ws:", "wss:"] : []),
    ].join(" ");
    const assetSources = assetOrigin ? [assetOrigin.origin] : [];

    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      ["img-src 'self' data: blob: https://lh3.googleusercontent.com", ...assetSources, "https://*.r2.cloudflarestorage.com"].join(" "),
      "font-src 'self' data:",
      `connect-src ${connectSrc}`,
      ["media-src 'self'", ...assetSources, "https://*.r2.cloudflarestorage.com"].join(" "),
      "worker-src 'self'",
      "manifest-src 'self'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com https://portaly.ai https://app.kit.com",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy", value: csp },
          // F-20: COOP/CORP isolate the app from cross-origin window
          // references and cross-origin embedding of our resources.
          // Skipping COEP for now — it requires every embedded resource
          // to opt in via CORP, which would break Google profile images
          // and other third-party assets until they all set the right
          // headers. Enable when you can audit and pin every image
          // source.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
        ],
      },
      {
        // API routes: no CORS by default (same-origin only).
        // Callback and entitlements are server-to-server; CORS irrelevant.
        source: "/api/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

const sentryUploadEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
);

export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  webpack: { treeshake: { removeDebugLogging: true } },
  sourcemaps: { disable: !sentryUploadEnabled },
  release: {
    name: process.env.SENTRY_RELEASE || process.env.APP_VERSION || process.env.GIT_COMMIT_SHA,
    create: sentryUploadEnabled,
    finalize: sentryUploadEnabled,
  },
});
