import test from "node:test";
import assert from "node:assert/strict";

import { classifyPaths, isContainerSensitivePath, isLightweightPath } from "./classify-ci-scope.mjs";

test("documentation, agent skill, and plugin source changes use the static gate only", () => {
  const result = classifyPaths([
    "docs/contracts/ci.md",
    ".claude/skills/agent-api-paid-service/SKILL.md",
    "plugins/cabai/skills/cabai/SKILL.md",
    "plugins/cabai-admin/.codex-plugin/plugin.json",
    "scripts/package-cabai-plugin.ts",
  ]);

  assert.deepEqual(
    { full: result.full, container: result.container, reason: result.reason },
    { full: false, container: false, reason: "lightweight-only" },
  );
});

test("public UI changes retain full verification without container boundary work", () => {
  const result = classifyPaths(["src/app/(public)/page.tsx", "src/components/home/hero.tsx"]);

  assert.equal(result.full, true);
  assert.equal(result.container, false);
  assert.equal(result.reason, "runtime-or-build");
});

test("API and migration changes retain the container boundary gate", () => {
  const result = classifyPaths(["src/app/api/agent/public/v1/library/route.ts", "drizzle/0018_migration.sql"]);

  assert.equal(result.full, true);
  assert.equal(result.container, true);
  assert.equal(result.reason, "container-sensitive");
});

test("unknown paths fail closed to full verification", () => {
  const result = classifyPaths(["new-root-runtime-config.json"]);

  assert.equal(result.full, true);
  assert.equal(result.container, false);
  assert.equal(isLightweightPath("new-root-runtime-config.json"), false);
});

test("manual and detection fallback force every safety gate", () => {
  const result = classifyPaths(["__FORCE_FULL__"]);

  assert.equal(result.full, true);
  assert.equal(result.container, true);
  assert.equal(isContainerSensitivePath("Dockerfile"), true);
});
