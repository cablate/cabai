import winston from "winston";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

// ─── Config ───

const LOG_DIR = join(process.cwd(), "logs");
const MAX_LOG_FILES = 20;

// ─── Per-startup log file ───

let resolvedLogFile: string | null = null;
let logFileResolved = false;

function resolveLogFile(): string | null {
  if (logFileResolved) return resolvedLogFile;
  logFileResolved = true;

  // A production build imports server modules from several workers. Creating
  // per-worker log files there makes Next trace transient files that may be
  // deleted by the retention cleanup before the standalone copy step.
  if (
    process.env.NEXT_RUNTIME === "edge" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return null;
  }

  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    resolvedLogFile = join(LOG_DIR, `${ts}.log`);

    // Cleanup: keep newest MAX_LOG_FILES, delete the rest
    const files = readdirSync(LOG_DIR)
      .filter((f) => f.endsWith(".log"))
      .sort()
      .reverse();
    for (const file of files.slice(MAX_LOG_FILES)) {
      unlinkSync(join(LOG_DIR, file));
    }

    return resolvedLogFile;
  } catch {
    return null;
  }
}

// ─── Winston instance ───

function buildTransports(): winston.transport[] {
  const transports: winston.transport[] = [
    new winston.transports.Console({
      stderrLevels: ["error"],
    }),
  ];

  const filePath = resolveLogFile();
  if (filePath) {
    transports.push(new winston.transports.File({ filename: filePath }));
  }

  return transports;
}

const rootLogger = winston.createLogger({
  level: (process.env.LOG_LEVEL ?? "info").toLowerCase(),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: buildTransports(),
});

// ─── Public API ───

export function createLogger(module: string) {
  const child = rootLogger.child({ module });
  return {
    debug: (msg: string, data?: Record<string, unknown>) =>
      child.debug(msg, data),
    info: (msg: string, data?: Record<string, unknown>) =>
      child.info(msg, data),
    warn: (msg: string, data?: Record<string, unknown>) =>
      child.warn(msg, data),
    error: (msg: string, data?: Record<string, unknown>) =>
      child.error(msg, data),
  };
}

// Default logger for quick use
export const log = createLogger("app");
