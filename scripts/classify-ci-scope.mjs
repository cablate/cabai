import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const LIGHTWEIGHT_PREFIXES = Object.freeze([
  ".agents/",
  ".claude/",
  "docs/",
  "plans/",
  "plugins/",
]);

const LIGHTWEIGHT_FILES = new Set([
  "scripts/package-cabai-plugin.ts",
]);

const CONTAINER_PREFIXES = Object.freeze([
  ".github/workflows/",
  "deploy/",
  "drizzle/",
  "scripts/",
  "src/app/api/",
  "src/lib/",
  "src/server/",
]);

const CONTAINER_FILES = new Set([
  ".dockerignore",
  ".node-version",
  "Dockerfile",
  "compose.production.example.yml",
  "compose.yml",
  "compose.yaml",
  "eslint.config.mjs",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "tsconfig.json",
  "vitest.component.config.ts",
  "vitest.config.ts",
  "vitest.contract.config.ts",
  "vitest.integration.config.ts",
]);

function normalizePath(value) {
  return value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
}

export function isLightweightPath(value) {
  const path = normalizePath(value);
  if (!path) return false;
  if (LIGHTWEIGHT_FILES.has(path)) return true;
  if (LIGHTWEIGHT_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return !path.includes("/") && path.endsWith(".md");
}

export function isContainerSensitivePath(value) {
  const path = normalizePath(value);
  if (!path) return false;
  if (CONTAINER_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return CONTAINER_FILES.has(path);
}

export function classifyPaths(input) {
  const paths = input.map(normalizePath).filter(Boolean);

  if (paths.length === 0 || paths.includes("__FORCE_FULL__")) {
    return {
      full: true,
      container: true,
      reason: "force-full",
      paths,
    };
  }

  const full = paths.some((path) => !isLightweightPath(path));
  const container = full && paths.some(isContainerSensitivePath);

  return {
    full,
    container,
    reason: !full ? "lightweight-only" : container ? "container-sensitive" : "runtime-or-build",
    paths,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fileFlagIndex = args.indexOf("--from-file");
  const filePath = fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined;
  const source = filePath ? await readFile(filePath, "utf8") : "__FORCE_FULL__\n";
  const result = classifyPaths(source.split(/\r?\n/));

  console.log(
    `[ci-scope] full=${result.full} container=${result.container} reason=${result.reason} files=${result.paths.length}`,
  );

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `full=${result.full}\ncontainer=${result.container}\nreason=${result.reason}\n`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
