import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

test("migration SQL checkout bytes stay canonical across Git autocrlf modes", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cabai-sql-eol-"));
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = Buffer.from("CREATE TABLE example (id integer);\nSELECT 1;\n");
  for (const mode of ["true", "false", "input"]) {
    const cwd = path.join(root, mode);
    mkdirSync(path.join(cwd, "drizzle"), { recursive: true });
    writeFileSync(path.join(cwd, ".gitattributes"), readFileSync(new URL("../.gitattributes", import.meta.url)));
    writeFileSync(path.join(cwd, "drizzle", "0000_example.sql"), source);
    const git = (...args) => execFileSync("git", ["-c", `core.autocrlf=${mode}`, ...args], { cwd, stdio: "pipe" });
    git("init", "--quiet");
    git("add", ".gitattributes", "drizzle/0000_example.sql");
    rmSync(path.join(cwd, "drizzle", "0000_example.sql"));
    git("checkout-index", "--all", "--force");
    assert.deepEqual(readFileSync(path.join(cwd, "drizzle", "0000_example.sql")), source, `checkout bytes drifted with autocrlf=${mode}`);
    assert.deepEqual(git("show", ":drizzle/0000_example.sql"), source, "tracked SQL must remain unchanged");
  }
});

test("Git excludes deployment/test-run secrets but keeps reviewed synthetic templates", () => {
  // Isolate global excludes so only the shipped publication rules are tested.
  const root = mkdtempSync(path.join(os.tmpdir(), "cabai-ignore-rules-"));
  writeFileSync(path.join(root, ".gitignore"), readFileSync(new URL("../.gitignore", import.meta.url)));
  writeFileSync(path.join(root, "empty-excludes"), "");
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  const excluded = [
    ".env", ".env.production", ".env.oss-container", ".env.custom", ".env.test.local",
    "deploy/.env", "deploy/.env.test", "deploy/.env.example", "runtime/private.key", "tls/site.pem",
    "identity.p12", "identity.pfx", "app.keystore", "id_ed25519", "service-account-prod.json",
    "credentials.local.json", "secrets/provider.json", ".mcp.json", ".aws/credentials",
    ".claude/settings.local.json", "data/storage/member.pdf", "data/backups/db.sql",
    "backups/snapshot.sql.gz", "exports/customers.csv", "private/incident.md",
    "docs/private/incident.md", "src/contents/paid-course/lesson.md", "local.db-wal",
    "local.sqlite3-shm", "snapshot.dump", ".codex-dev-3102.stderr.log", "logs/app.log.1",
    ".tmp-railway-npm-cache/cache", "tmp-ui-checks/screen.png", "playwright/.auth/admin.json",
    "test-results/trace.zip", "node_modules/x.js", "deploy/worker/node_modules/x.js",
    "dist/plugin.zip", ".next/server/app.js", ".wrangler/state.json", "public/site/logo.png",
    "coverage/lcov.info", "deploy/cloudflare/maintenance-worker/coverage/lcov.info",
    "scripts/local/operator.ts", "scripts/task.local.mjs", "scripts/.content-sync-cache.json",
  ];
  const included = [
    ".env.example", ".env.test", ".npmrc", "package-lock.json", "AGENTS.md", "PRINCIPLES.md",
    "drizzle/0027_example.sql", "drizzle/meta/_journal.json", "fixtures/demo-course/manifest.json",
    "fixtures/course-portability/course-export-v1.json", "docs/contracts/api-route-boundaries.json",
    "docs/audit/public-review.md", "docs/development/CONFIGURATION.md", "public/oss/icon.svg",
    "src/app/api/storage/local/read/route.ts", "src/lib/database-backup/local-sink.test.ts",
    "scripts/audit-backup-lifecycle.ts", "plugins/cabai/.codex-plugin/plugin.json",
    ".github/workflows/ci.yml", ".claude/skills/shared/SKILL.md",
    "src/app/admin/information/coverage/page.tsx", "src/app/api/agent/information/coverage/route.ts",
  ];
  const output = execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`,
    "-c", "core.excludesFile=" + path.join(root, "empty-excludes"), "check-ignore", "--no-index", "--stdin"], {
    cwd: root,
    input: [...excluded, ...included].join("\n") + "\n",
    encoding: "utf8",
  });
  assert.deepEqual(output.trim().split(/\r?\n/), excluded);
});

test("Linux shell entrypoints contain no carriage returns", async () => {
  for (const name of ["install-postgres-client.sh", "pre-deploy.sh"]) {
    const source = await readFile(new URL(name, import.meta.url), "utf8");
    assert.ok(source.startsWith("#!/usr/bin/env bash\n"), name);
    assert.equal(source.includes("\r"), false, name);
  }
});

test("Docker context also excludes operator state without blocking public branding", async () => {
  const rules = (await readFile(new URL("../.dockerignore", import.meta.url), "utf8"))
    .split(/\r?\n/).map((line) => line.trim());
  for (const rule of [".env", "*.key", "*.pfx", ".mcp.json", "data", "private", "secrets",
    "credentials", "src/contents", "docs/private", "docs/internal", "*.log", "playwright/.auth"]) {
    assert.ok(rules.includes(rule), rule);
  }
  assert.equal(rules.includes("public/site"), false);
  assert.equal(rules.includes("public"), false);
});

test("Git preserves LF shell entrypoints across Windows checkouts", async () => {
  const attributes = await readFile(new URL("../.gitattributes", import.meta.url), "utf8");
  assert.match(attributes, /^\*\.sh text eol=lf$/m);
});

test("bare image grants cache writes after COPY without changing code ownership", async () => {
  const source = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  const cacheSetup = source.indexOf("RUN mkdir -p /app/.next/cache/images");
  assert.ok(cacheSetup > source.lastIndexOf("\nCOPY "));
  assert.ok(cacheSetup < source.indexOf("\nUSER node"));
  assert.match(source.slice(cacheSetup), /chown -R node:node \/app\/\.next\/cache/);
  assert.match(source.slice(cacheSetup), /chmod 0700 \/app\/\.next\/cache/);
  assert.doesNotMatch(source.slice(cacheSetup), /chown[^\n]*node:node \/app(?:\/\.next)?\s*(?:\\|$)/m);

  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const bareProbe = workflow.match(/docker run --rm --entrypoint sh "\$CABAI_IMAGE" -c \\\r?\n\s*'([^']+)'/);
  assert.ok(bareProbe, "CI must probe the image without cache mounts");
  assert.match(bareProbe[1], /id -u/);
  assert.match(bareProbe[1], /printf synthetic > \/app\/\.next\/cache\/images\/ci-probe\/write-test/);
  for (const codePath of ["/app/server.js", "/app/.next/server", "/app/.next/static"]) {
    assert.ok(bareProbe[1].includes(`test ! -w ${codePath}`), codePath);
  }
});

test("reference Compose gives the non-root runtime bounded writable log and cache mounts", async () => {
  const source = await readFile(new URL("../compose.production.example.yml", import.meta.url), "utf8");
  for (const mount of ["/app/logs", "/app/.next/cache"]) {
    const line = source.split("\n").find((entry) => entry.trim().startsWith(`- ${mount}:`));
    assert.ok(line, mount);
    for (const option of ["rw", "noexec", "nosuid", "uid=1000", "gid=1000", "mode=0700"]) {
      assert.ok(line.includes(option), `${mount}: ${option}`);
    }
  }
});
