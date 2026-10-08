#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertDatabaseSchemaCurrent,
  MigrationRuntimeError,
  runMigrations,
} from "./run-migrations.mjs";

export function resolveMigrationMode(value = process.env.MIGRATION_MODE) {
  const mode = value?.trim() || "auto";
  if (mode !== "auto" && mode !== "external") {
    throw new MigrationRuntimeError(
      "MIGRATION_MODE_INVALID",
      "MIGRATION_MODE must be auto or external.",
    );
  }
  return mode;
}

function startNextServer() {
  const child = spawn(process.execPath, [resolve("scripts/start-next-server.mjs")], {
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGTERM", () => forward("SIGTERM"));
  process.once("SIGINT", () => forward("SIGINT"));

  child.once("error", () => {
    console.error("[startup] SERVER_START_FAILED: The application server could not be started.");
    process.exitCode = 1;
  });
  child.once("close", (code, signal) => {
    if (typeof code === "number") process.exitCode = code;
    else if (signal) process.exitCode = 1;
  });
}

export async function main() {
  try {
    const mode = resolveMigrationMode();
    console.log(`[startup] migration mode=${mode}`);
    const schema = mode === "auto"
      ? await runMigrations()
      : await assertDatabaseSchemaCurrent();
    console.log(`[startup] schema current tag=${schema.tag} hash=${schema.hashStatus}`);

    if (process.argv.includes("--check-only")) return;
    startNextServer();
  } catch (error) {
    const code = error instanceof MigrationRuntimeError ? error.code : "STARTUP_PREFLIGHT_FAILED";
    const message = error instanceof MigrationRuntimeError ? error.message : "Production startup preflight failed.";
    console.error(`[startup] ${code}: ${message}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) await main();
