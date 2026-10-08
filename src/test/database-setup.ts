import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { requireTestDatabaseUrl } from "./setup";

const DEFAULT_SCHEMA_SYNC_TIMEOUT_MS = 120_000;
const PROCESS_CLEANUP_TIMEOUT_MS = 5_000;
const OUTPUT_LIMIT = 20_000;

interface CommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  displayCommand: string;
}

function appendOutput(current: string, chunk: Buffer): string {
  return `${current}${chunk.toString()}`.slice(-OUTPUT_LIMIT);
}

function waitForClose(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    const taskkill = spawn(
      "taskkill",
      ["/pid", String(child.pid), "/T", "/F"],
      { stdio: "ignore", windowsHide: true },
    );

    await waitForClose(taskkill, PROCESS_CLEANUP_TIMEOUT_MS);
    if (taskkill.exitCode === null && taskkill.signalCode === null) {
      taskkill.kill();
    }
  } else {
    child.kill("SIGTERM");
  }

  await waitForClose(child, PROCESS_CLEANUP_TIMEOUT_MS);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForClose(child, PROCESS_CLEANUP_TIMEOUT_MS);
  }
}

function commandFailure(
  reason: string,
  displayCommand: string,
  stdout: string,
  stderr: string,
): Error {
  return new Error(
    [
      `[integration setup] ${reason}`,
      `Command: ${displayCommand}`,
      `stdout:\n${stdout || "<empty>"}`,
      `stderr:\n${stderr || "<empty>"}`,
    ].join("\n\n"),
  );
}

export async function runCommandWithTimeout(
  command: string,
  args: string[],
  options: CommandOptions,
): Promise<void> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  let settled = false;

  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    stdout = appendOutput(stdout, chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    stderr = appendOutput(stderr, chunk);
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;

      void terminateProcessTree(child).finally(() => {
        reject(
          commandFailure(
            `Command exceeded ${options.timeoutMs}ms and was terminated.`,
            options.displayCommand,
            stdout,
            stderr,
          ),
        );
      });
    }, options.timeoutMs);

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        commandFailure(
          `Unable to start command: ${error.message}`,
          options.displayCommand,
          stdout,
          stderr,
        ),
      );
    });

    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        commandFailure(
          `Command failed with code ${String(code)}${signal ? ` and signal ${signal}` : ""}.`,
          options.displayCommand,
          stdout,
          stderr,
        ),
      );
    });
  });
}

export async function syncTestDatabase(
  databaseUrl: string,
  timeoutMs = DEFAULT_SCHEMA_SYNC_TIMEOUT_MS,
): Promise<void> {
  requireTestDatabaseUrl({ ...process.env, DATABASE_URL: databaseUrl });
  const migrationRunner = path.resolve(
    process.cwd(),
    "scripts",
    "run-migrations.mjs",
  );

  if (!existsSync(migrationRunner)) {
    throw new Error(
      `[integration setup] Migration runner not found at ${migrationRunner}.`,
    );
  }

  await runCommandWithTimeout(process.execPath, [migrationRunner], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeoutMs,
    displayCommand: "node scripts/run-migrations.mjs",
  });
}
