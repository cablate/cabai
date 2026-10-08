#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

type TestEvidence = {
  status: string;
  references?: unknown;
  note?: unknown;
};

type RegistryEntry = {
  route: string;
  source?: string;
  category: string;
  owner: string;
  reason: string;
  status: string;
  test: TestEvidence;
};

type Registry = {
  schema_version: string;
  routes: RegistryEntry[];
};

const root = process.cwd();
const apiRoot = path.join(root, "src", "app", "api");
const registryPath = path.join(root, "docs", "contracts", "api-route-boundaries.json");
const allowedCategories = new Set([
  "static/generated",
  "framework-auth",
  "provider-callback/raw-signature",
  "redirect-stream-storage",
  "ordinary-candidate",
  "high-risk-domain-candidate",
]);

function normalizedSourcePath(filePath: string): string {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function routePathForFile(filePath: string): string {
  const relativeDirectory = path.relative(apiRoot, path.dirname(filePath));
  if (!relativeDirectory || relativeDirectory === ".") return "/api";

  const segments = relativeDirectory.split(path.sep).map((segment) => {
    const dynamicSegment = /^\[([^\]]+)\]$/.exec(segment);
    return dynamicSegment ? `{${dynamicSegment[1]}}` : segment;
  });
  return `/api/${segments.join("/")}`;
}

async function routeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.name === "route.ts" ? [fullPath] : [];
  }));
  return nested.flat();
}

function isSharedHandlerSource(source: string): boolean {
  // The optional generic type parameter supports both `withApiHandler(` and
  // `withApiHandler<Context>(` without treating an import-only mention as a
  // wrapped route.
  return /\bwithApiHandler(?:\s*<[^;]*?>)?\s*\(/s.test(source);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isWildcardRoute(route: string): boolean {
  // Catch-all Next segments are normalized to `{...name}` and are exact
  // entries. Wildcards and Express-style placeholders are not accepted.
  return route.includes("*")
    || route.includes("[")
    || route.includes("]")
    || /(^|\/)\.\.\.(?:\/|$)/.test(route)
    || route.includes(":");
}

function entryFromUnknown(value: unknown, index: number, errors: string[]): RegistryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`routes[${index}] must be an object`);
    return null;
  }

  const entry = value as Partial<RegistryEntry>;
  for (const field of ["route", "category", "owner", "reason", "status"] as const) {
    if (!isNonEmptyString(entry[field])) errors.push(`routes[${index}].${field} must be non-empty`);
  }

  if (!entry.test || typeof entry.test !== "object" || Array.isArray(entry.test)) {
    errors.push(`routes[${index}].test must be a non-empty object`);
  } else if (!isNonEmptyString((entry.test as TestEvidence).status)) {
    errors.push(`routes[${index}].test.status must be non-empty`);
  }

  if (entry.source !== undefined && !isNonEmptyString(entry.source)) {
    errors.push(`routes[${index}].source must be non-empty when provided`);
  }

  return entry as RegistryEntry;
}

async function main(): Promise<void> {
  const errors: string[] = [];
  let rawRegistry: unknown;
  try {
    rawRegistry = JSON.parse(await readFile(registryPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${normalizedSourcePath(registryPath)}: ${String(error)}`);
  }

  if (!rawRegistry || typeof rawRegistry !== "object" || Array.isArray(rawRegistry)) {
    throw new Error("API route boundary registry must be an object");
  }
  const registryValue = rawRegistry as Partial<Registry>;
  if (registryValue.schema_version !== "api-route-boundaries/v1") {
    errors.push("registry.schema_version must be api-route-boundaries/v1");
  }
  if (!Array.isArray(registryValue.routes)) {
    errors.push("registry.routes must be an array");
  }

  const registryEntries = Array.isArray(registryValue.routes)
    ? registryValue.routes
      .map((entry, index) => entryFromUnknown(entry, index, errors))
      .filter((entry): entry is RegistryEntry => entry !== null)
    : [];

  const duplicateRoutes = registryEntries
    .map((entry) => entry.route)
    .filter((route, index, routes) => routes.indexOf(route) !== index);
  for (const route of new Set(duplicateRoutes)) errors.push(`registry has duplicate route: ${route}`);

  for (const [index, entry] of registryEntries.entries()) {
    if (isNonEmptyString(entry.route) && !entry.route.startsWith("/api/")) {
      errors.push(`routes[${index}].route must start with /api/: ${entry.route}`);
    }
    if (isNonEmptyString(entry.route) && isWildcardRoute(entry.route)) {
      errors.push(`routes[${index}].route must be exact (wildcards are forbidden): ${entry.route}`);
    }
    if (isNonEmptyString(entry.category) && !allowedCategories.has(entry.category)) {
      errors.push(`routes[${index}].category is not allowed: ${entry.category}`);
    }
    if (entry.test && typeof entry.test === "object" && !Array.isArray(entry.test)) {
      const references = (entry.test as TestEvidence).references;
      if (references !== undefined && (!Array.isArray(references) || references.some((reference) => !isNonEmptyString(reference)))) {
        errors.push(`routes[${index}].test.references must be an array of strings`);
      }
    }
  }

  const files = await routeFiles(apiRoot);
  const liveRoutes = new Map<string, { source: string; wrapped: boolean }>();
  await Promise.all(files.map(async (filePath) => {
    const route = routePathForFile(filePath);
    if (liveRoutes.has(route)) {
      errors.push(`multiple source files map to the same route: ${route}`);
      return;
    }
    const source = await readFile(filePath, "utf8");
    liveRoutes.set(route, {
      source: normalizedSourcePath(filePath),
      wrapped: isSharedHandlerSource(source),
    });
  }));

  const entriesByRoute = new Map(registryEntries.map((entry) => [entry.route, entry]));
  for (const [route, entry] of entriesByRoute) {
    const live = liveRoutes.get(route);
    if (!live) {
      errors.push(`registry route does not exist in live source: ${route}`);
      continue;
    }
    if (live.wrapped) errors.push(`wrapped route must not be registered as an exception: ${route}`);
    if (entry.source && entry.source !== live.source) {
      errors.push(`registry source mismatch for ${route}: expected ${live.source}, got ${entry.source}`);
    }
  }

  for (const [route, live] of liveRoutes) {
    if (!live.wrapped && !entriesByRoute.has(route)) {
      errors.push(`unwrapped route is missing an exact registry entry: ${route} (${live.source})`);
    }
  }

  if (errors.length > 0) {
    throw new Error(["API route boundaries guard failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  }

  const wrappedCount = [...liveRoutes.values()].filter(({ wrapped }) => wrapped).length;
  console.log(`API route boundaries guard passed (${liveRoutes.size} routes: ${wrappedCount} shared, ${entriesByRoute.size} exact exceptions).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
