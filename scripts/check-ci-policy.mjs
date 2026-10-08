import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parse } from "yaml";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);
const workflowSource = await readFile(workflowPath, "utf8");
const workflow = parse(workflowSource);
const releaseWorkflow = parse(await readFile(new URL("../.github/workflows/release-evidence.yml", import.meta.url), "utf8"));
for (const [name, candidate] of [["CI", workflow], ["Release evidence", releaseWorkflow]]) {
  assert.equal(candidate.permissions?.contents, "read", `${name} must default to read-only contents.`);
  assert.ok(Object.values(candidate.permissions).every((permission) => permission === "read" || permission === "none"), `${name} top-level token permissions must not grant writes.`);
  for (const job of Object.values(candidate.jobs)) {
    for (const step of job.steps ?? []) {
      if (!step.uses) continue;
      assert.match(step.uses, /^[\w-]+\/[\w./-]+@[a-f0-9]{40}$/, `${name}: external actions must use a full immutable commit SHA.`);
      if (step.uses.startsWith("actions/checkout@")) {
        assert.equal(step.with?.["persist-credentials"], false, `${name}: checkout must not persist its token.`);
      }
    }
  }
}
assert.deepEqual(Object.keys(releaseWorkflow.on), ["workflow_dispatch"], "Release evidence remains an explicit manual operation.");
assert.deepEqual(releaseWorkflow.jobs.evidence.permissions, { contents: "read", "id-token": "write", attestations: "write" }, "Only the evidence job receives required provenance permissions.");
const triggers = workflow.on;

assert.ok(triggers && typeof triggers === "object", "CI must declare event triggers.");
assert.ok(
  Object.hasOwn(triggers, "pull_request"),
  "Full CI must run automatically for pull requests.",
);
assert.ok(
  Object.hasOwn(triggers, "workflow_dispatch"),
  "Full CI must retain a manual workflow_dispatch recovery path.",
);
assert.ok(
  !Object.hasOwn(triggers, "push"),
  "Full CI must not repeat automatically after a verified PR is merged.",
);
assert.ok(workflow.jobs?.verify, "CI must retain the verify job.");
assert.ok(workflow.jobs?.container, "CI must retain the container job.");
assert.ok(workflow.jobs?.scope, "CI must retain the change-scope job.");
assert.equal(workflow.jobs.scope.outputs?.full, "${{ steps.classify.outputs.full }}");
assert.equal(workflow.jobs.scope.outputs?.container, "${{ steps.classify.outputs.container }}");
assert.equal(workflow.jobs.verify.needs, "scope", "Verify must consume the scope result.");
assert.equal(workflow.jobs.container.needs, "scope", "Container must consume the scope result.");
assert.match(String(workflow.jobs.container.if), /container/);
assert.equal(
  workflow.concurrency?.["cancel-in-progress"],
  true,
  "Superseded runs for the same ref must be cancelled.",
);

const usedActions = Object.values(workflow.jobs).flatMap((job) =>
  (job.steps ?? []).flatMap((step) => (step.uses ? [step.uses] : [])),
);

assert.ok(
  usedActions.includes("actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803"),
  "CI checkout must use the Node 24 action runtime.",
);
assert.ok(
  usedActions.includes("actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38"),
  "CI setup-node must use the Node 24 action runtime.",
);
assert.ok(
  usedActions.includes("actions/cache/restore@caa296126883cff596d87d8935842f9db880ef25"),
  "CI cache restore must use the Node 24 action runtime.",
);
assert.ok(
  usedActions.includes("actions/cache/save@caa296126883cff596d87d8935842f9db880ef25"),
  "CI cache save must use the Node 24 action runtime.",
);
assert.ok(
  usedActions.includes("docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069"),
  "Container CI must set up a cache-export-capable Buildx builder.",
);

const verifyCache = (workflow.jobs.verify.steps ?? []).find(
  (step) =>
    step.uses === "actions/cache/restore@caa296126883cff596d87d8935842f9db880ef25" && String(step.with?.path).includes(".next/cache"),
);
assert.ok(verifyCache, "Verify must retain the Next.js cache.");
assert.ok(
  !String(verifyCache.with?.key).includes("src/**/*"),
  "Next.js cache keys must not create a new cache for every source change.",
);
assert.match(String(verifyCache.with?.key), /postcss\.config\.mjs/);

const verifyCacheSave = (workflow.jobs.verify.steps ?? []).find(
  (step) =>
    step.uses === "actions/cache/save@caa296126883cff596d87d8935842f9db880ef25" && String(step.with?.path).includes(".next/cache"),
);
assert.ok(verifyCacheSave, "Verify must save a newly populated Next.js cache after build.");

const verifyBuild = (workflow.jobs.verify.steps ?? []).find((step) => step.name === "Build");
const verifySmoke = (workflow.jobs.verify.steps ?? []).find(
  (step) => step.name === "Smoke test production server",
);
for (const step of [verifyBuild, verifySmoke, verifyCacheSave]) {
  assert.match(
    String(step?.if),
    /outputs\.container != 'true'/,
    `${step?.name ?? "Verify production step"} must yield production ownership to container CI.`,
  );
}

const containerCache = (workflow.jobs.container.steps ?? []).find(
  (step) =>
    step.uses === "actions/cache/restore@caa296126883cff596d87d8935842f9db880ef25" && String(step.with?.path).includes(".buildx-cache"),
);
assert.ok(containerCache, "Container must restore a Docker layer cache.");

const containerCacheSave = (workflow.jobs.container.steps ?? []).find(
  (step) =>
    step.uses === "actions/cache/save@caa296126883cff596d87d8935842f9db880ef25" && String(step.with?.path).includes(".buildx-cache"),
);
assert.ok(containerCacheSave, "Container must save a newly exported Docker layer cache.");

const containerBuild = (workflow.jobs.container.steps ?? []).find(
  (step) => step.name === "Build production image",
);
assert.match(String(containerBuild?.run), /docker buildx build/);
assert.match(String(containerBuild?.run), /--cache-to type=local/);
assert.match(String(containerBuild?.run), /--load/);

const containerSmoke = (workflow.jobs.container.steps ?? []).find(
  (step) => step.name === "Run fresh migration and container smoke",
);
assert.match(String(containerSmoke?.run), /run script:seed-demo/);
assert.match(String(containerSmoke?.run), /run smoke/);
assert.match(String(containerSmoke?.run), /SMOKE_PRODUCT_ID/);

const cacheReports = Object.values(workflow.jobs).flatMap((job) =>
  (job.steps ?? []).filter((step) => String(step.name).includes("cache metrics")),
);
assert.equal(cacheReports.length, 2, "Verify and container must report cache metrics.");
assert.ok(cacheReports.every((step) => String(step.run).includes("GITHUB_STEP_SUMMARY")));

console.log("CI trigger and official action policy passed.");
