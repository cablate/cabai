#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RuntimeNextConfigError,
  withRuntimeServerActionOrigin,
} from "./runtime-next-config.mjs";

const require = createRequire(import.meta.url);

async function loadRuntimeConfig(appRoot, env = process.env) {
  const configPath = join(appRoot, ".next", "required-server-files.json");
  let requiredFiles;
  try {
    requiredFiles = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    throw new RuntimeNextConfigError(
      "NEXT_CONFIG_LOAD_FAILED",
      "The baked Next.js runtime configuration could not be loaded.",
    );
  }

  return withRuntimeServerActionOrigin(requiredFiles.config, env.NEXT_PUBLIC_APP_URL);
}

function parseKeepAliveTimeout(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function main() {
  const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  process.env.NODE_ENV = "production";
  process.chdir(appRoot);

  const nextConfig = await loadRuntimeConfig(appRoot);
  const allowedOrigins = nextConfig.experimental.serverActions.allowedOrigins;

  if (process.argv.includes("--check-config")) {
    console.log(JSON.stringify({ status: "ok", serverActionAllowedOrigins: allowedOrigins }));
    return;
  }

  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);
  require("next");
  const { startServer } = require("next/dist/server/lib/start-server");

  const port = Number.parseInt(process.env.PORT ?? "3000", 10) || 3000;
  const hostname = process.env.HOSTNAME || "0.0.0.0";
  const keepAliveTimeout = parseKeepAliveTimeout(process.env.KEEP_ALIVE_TIMEOUT);

  await startServer({
    dir: appRoot,
    isDev: false,
    config: nextConfig,
    hostname,
    port,
    allowRetry: false,
    keepAliveTimeout,
  });
}

main().catch((error) => {
  const code = error instanceof RuntimeNextConfigError ? error.code : "NEXT_SERVER_START_FAILED";
  const message = error instanceof RuntimeNextConfigError
    ? error.message
    : "The Next.js production server could not be started.";
  console.error(`[startup] ${code}: ${message}`);
  process.exitCode = 1;
});
