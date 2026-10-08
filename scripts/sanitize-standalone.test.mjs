import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sanitizeStandalone } from "./sanitize-standalone.mjs";

test("all package build entrypoints run the artifact boundary after a successful build", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const builds = Object.entries(manifest.scripts).filter(([name]) => name === "build" || name.startsWith("build:"));
  assert.ok(builds.length >= 2);
  for (const [name, command] of builds) {
    assert.match(command, /&& node scripts\/sanitize-standalone\.mjs$/, name);
  }
});

test("quarantines only artifact state and preserves source environment and runtime files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cabai-build-boundary-"));
  const standalone = path.join(root, ".next", "standalone");
  await mkdir(path.join(standalone, "logs"), { recursive: true });
  await writeFile(path.join(root, ".env"), "synthetic-original");
  await writeFile(path.join(standalone, ".env"), "synthetic-copy");
  await writeFile(path.join(standalone, ".env.test"), "synthetic-test");
  await writeFile(path.join(standalone, ".env.example"), "public-example");
  await writeFile(path.join(standalone, ".git"), "synthetic-pointer");
  await writeFile(path.join(standalone, "server.js"), "runtime");
  assert.deepEqual(await sanitizeStandalone(root), { quarantinedEntries: 4 });
  assert.equal(await readFile(path.join(root, ".env"), "utf8"), "synthetic-original");
  assert.deepEqual((await readdir(standalone)).sort(), [".env.example", "server.js"]);
  const nextEntries = await readdir(path.join(root, ".next"));
  assert.equal(nextEntries.filter((name) => name.startsWith("build-state-quarantine-")).length, 1);
  assert.deepEqual(await sanitizeStandalone(root), { quarantinedEntries: 0 });
});

test("fails closed when there is no standalone artifact", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cabai-build-boundary-missing-"));
  await assert.rejects(sanitizeStandalone(root));
});

test("rejects a standalone junction pointing outside the repository", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "cabai-build-boundary-link-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "cabai-build-boundary-outside-"));
  await mkdir(path.join(root, ".next"));
  await writeFile(path.join(outside, ".env"), "synthetic-outside");
  await symlink(outside, path.join(root, ".next", "standalone"), "junction");
  await assert.rejects(sanitizeStandalone(root), /redirected artifact directories/);
  assert.equal(await readFile(path.join(outside, ".env"), "utf8"), "synthetic-outside");
});
