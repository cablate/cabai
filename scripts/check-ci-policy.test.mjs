import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["scripts/check-ci-policy.mjs", ".github/workflows/ci.yml", ".github/workflows/release-evidence.yml"];
const cases = [
  ["reviewed workflows pass", null, null, null],
  ["mutable CI action rejected", files[1], /actions\/checkout@[a-f0-9]{40}/, "actions/checkout@v6"],
  ["mutable release action rejected", files[2], /anchore\/sbom-action@[a-f0-9]{40}/, "anchore/sbom-action@v0"],
  ["default write token rejected", files[2], "  contents: read", "  contents: write"],
  ["persisted checkout token rejected", files[1], "persist-credentials: false", "persist-credentials: true"],
  ["automatic release evidence rejected", files[2], "  workflow_dispatch:", "  push:"],
];

for (const [name, changedFile, pattern, replacement] of cases) {
  test(name, async () => {
    const parent = join(root, "tmp");
    await mkdir(parent, { recursive: true });
    const canonicalParent = await realpath(parent);
    const fixture = await mkdtemp(join(canonicalParent, "ci-policy-"));
    try {
      await mkdir(join(fixture, "scripts"));
      await mkdir(join(fixture, ".github/workflows"), { recursive: true });
      for (const file of files) {
        let source = await readFile(join(root, file), "utf8");
        if (file === changedFile) {
          const changed = source.replace(pattern, replacement);
          assert.notEqual(changed, source, "Mutation must exercise the intended guard");
          source = changed;
        }
        await writeFile(join(fixture, file), source);
      }
      const result = spawnSync(process.execPath, [join(fixture, files[0])], { encoding: "utf8", timeout: 15_000 });
      assert.ifError(result.error);
      if (changedFile === null) assert.equal(result.status, 0, result.stderr);
      else {
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /AssertionError/);
      }
    } finally {
      const target = await realpath(fixture);
      assert.ok(target.startsWith(`${canonicalParent}${sep}ci-policy-`));
      await rm(target, { recursive: true, force: true });
    }
  });
}
