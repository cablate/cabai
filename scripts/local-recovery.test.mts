import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "pg";
import { runMigrations } from "./run-migrations.mjs";
import { LocalStorageProvider } from "../src/lib/storage/local-storage";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const image = "postgres:18.0-alpine";
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const docker = (...args: string[]) => execFileSync("docker", args, {
  encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"],
}).trim();

// Opt-in test: never accepts an operator DB URL, container or storage directory.
// Docker must already have the image; no implicit pull, bind mount or named volume.
test("recover a migrated database and local media into independent empty targets", { timeout: 180_000 }, async () => {
  const endpoint = process.env.DOCKER_CONTEXT
    ? docker("context", "inspect", "--format", '{{(index .Endpoints "docker").Host}}', process.env.DOCKER_CONTEXT)
    : process.env.DOCKER_HOST || docker("context", "inspect", "--format", '{{(index .Endpoints "docker").Host}}');
  assert.match(endpoint, /^(?:npipe|unix):\/\//, "Recovery test requires a local Docker engine, not a remote daemon");
  docker("image", "inspect", image);
  const parent = join(repo, "tmp");
  await mkdir(parent, { recursive: true });
  const parentReal = await realpath(parent);
  const root = await mkdtemp(join(parentReal, "recovery-"));
  const password = randomBytes(32).toString("hex");
  let container: string | undefined;
  let source: Client | undefined;
  let restored: Client | undefined;
  try {
    container = docker("run", "--detach", "--rm", "--pull=never",
      "--name", `cabai-recovery-${randomUUID()}`, "--label", "cabai.purpose=synthetic-recovery-test",
      "--publish", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql",
      "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=recovery_source", image);
    assert.match(container, /^[a-f0-9]{64}$/);
    const binding = docker("port", container, "5432/tcp");
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "recovery_source"); ready = true; break; }
      catch { await new Promise((done) => setTimeout(done, 500)); }
    }
    assert.ok(ready, "Disposable PostgreSQL did not become ready");
    const sourceUrl = `postgresql://postgres:${password}@${binding}/recovery_source`;
    const targetUrl = `postgresql://postgres:${password}@${binding}/recovery_restore_drill`;
    await runMigrations({ databaseUrl: sourceUrl });
    source = new Client({ connectionString: sourceUrl });
    await source.connect();
    await source.query("INSERT INTO users (id, email, role) VALUES ('recovery-owner', 'recovery@example.invalid', 'admin')");
    const original = new LocalStorageProvider(join(root, "source"), "synthetic-original-signing-key-32-characters", "http://localhost:3000");
    const fixtures = [
      { key: "courses/recovery/private.txt", context: "lesson-content", body: "Synthetic private lesson\n", type: "text/plain" },
      { key: "courses/recovery/public.svg", context: "course-image", body: '<svg xmlns="http://www.w3.org/2000/svg"/>', type: "image/svg+xml" },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      const bytes = Buffer.from(fixture.body);
      const url = await original.createUploadTarget({ key: fixture.key, contentType: fixture.type, contentLength: bytes.length, expiresIn: 60 });
      await original.storeUpload(new URL(url).searchParams.get("token")!, new Request(url, {
        method: "PUT", headers: { "Content-Type": fixture.type }, body: bytes,
      }));
      await source.query(`INSERT INTO media (id, storage_key, public_url, filename, mime_type, file_size, context, uploaded_by, media_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'recovery-owner','confirmed')`,
      [`recovery-${index}`, fixture.key, original.publicUrl(fixture.key), fixture.key.split("/").at(-1), fixture.type, bytes.length, fixture.context]);
    }
    const originalRows = (await source.query("SELECT * FROM media ORDER BY id")).rows;
    const originalMigrations = (await source.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows;

    // No writers run during this snapshot. Production must quiesce writers too.
    docker("exec", container, "pg_dump", "-U", "postgres", "-d", "recovery_source", "--no-owner", "--no-privileges", "-f", "/tmp/recovery.sql");
    await cp(join(root, "source"), join(root, "backup"), { recursive: true });
    docker("exec", container, "createdb", "-U", "postgres", "recovery_restore_drill");
    docker("exec", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "recovery_restore_drill", "-f", "/tmp/recovery.sql");
    restored = new Client({ connectionString: targetUrl });
    await restored.connect();
    assert.deepEqual((await restored.query("SELECT * FROM media ORDER BY id")).rows, originalRows);
    assert.deepEqual((await restored.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY id")).rows, originalMigrations);
    await runMigrations({ databaseUrl: targetUrl }); // Restored ledger stays usable/idempotent.

    const recovered = new LocalStorageProvider(join(root, "restored"), "synthetic-rotated-signing-key-32-characters", "http://localhost:4000");
    await assert.rejects(recovered.head(fixtures[0]!.key), "Database restore alone must not conjure media bytes");
    await cp(join(root, "backup"), join(root, "restored"), { recursive: true });
    for (const fixture of fixtures) {
      const bytes = Buffer.from(fixture.body);
      assert.equal(digest(await readFile(join(root, "restored", fixture.key))), digest(bytes));
      assert.deepEqual(await readFile(join(root, "restored", `${fixture.key}.meta.json`)), await readFile(join(root, "backup", `${fixture.key}.meta.json`)));
      assert.deepEqual(await recovered.head(fixture.key), { contentLength: bytes.length, contentType: fixture.type });
      const target = await recovered.createDownloadTarget(fixture.key, 60);
      const response = await recovered.readFromToken(new URL(target).searchParams.get("token")!);
      assert.equal(digest(new Uint8Array(await response.arrayBuffer())), digest(bytes));
      assert.equal(response.headers.get("content-type"), fixture.type);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    const oldLink = await original.createDownloadTarget(fixtures[0]!.key, 60);
    await assert.rejects(recovered.readFromToken(new URL(oldLink).searchParams.get("token")!), /Invalid storage token/);

    // A partial file-only restore must fail rather than silently inventing MIME metadata.
    const partial = join(root, "partial");
    await mkdir(dirname(join(partial, fixtures[0]!.key)), { recursive: true });
    await cp(join(root, "backup", fixtures[0]!.key), join(partial, fixtures[0]!.key));
    const incomplete = new LocalStorageProvider(partial, "synthetic-partial-signing-key-32-characters", "http://localhost:4000");
    await assert.rejects(incomplete.head(fixtures[0]!.key), /metadata is missing or invalid/);
  } finally {
    try {
      await Promise.all([source?.end(), restored?.end()]);
    } finally {
      try {
        if (container && /^[a-f0-9]{64}$/.test(container)) docker("stop", "--time", "5", container);
      } finally {
        const target = await realpath(root);
        assert.ok(target.startsWith(`${parentReal}${sep}recovery-`), "Refuse cleanup outside created test workspace");
        await rm(target, { recursive: true, force: true });
      }
    }
  }
});
