import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const script of ["sync-content.mjs", "upload-chapter.js", "publish-resource.mjs", "push-schema.ts"]) {
  test(`${script} is fail-closed even with old mutation flags`, () => {
    const path = fileURLToPath(new URL(script, import.meta.url));
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /\b(?:import|require|fetch)\s*\(/);
    const result = spawnSync(process.execPath, [path, "--apply", "--images-only"], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Retired:.*No changes were made/);
  });
}
