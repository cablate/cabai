import { lstat, mkdir, readdir, realpath, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const STATE_NAMES = [".git", "logs", "backups", "data", "tmp"];

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith(`..${path.sep}`)
    && relative !== ".." && !path.isAbsolute(relative);
}

// Next copies loaded .env files separately from its trace exclusions. Keep
// build-time state local, but never leave it in the redistributable subtree.
export async function sanitizeStandalone(repositoryRoot) {
  const root = await realpath(repositoryRoot);
  const nextRoot = await realpath(path.join(root, ".next"));
  const standalone = await realpath(path.join(nextRoot, "standalone"));
  if (nextRoot !== path.join(root, ".next") || standalone !== path.join(nextRoot, "standalone")) {
    throw new Error("Build boundary rejects redirected artifact directories");
  }

  const entries = await readdir(standalone);
  const names = entries.filter((name) => STATE_NAMES.includes(name)
    || (name === ".env" || name.startsWith(".env.")) && name !== ".env.example");
  const sources = [];
  for (const name of names) {
    const source = path.join(standalone, name);
    const stat = await lstat(source);
    if (stat.isSymbolicLink() || !within(standalone, await realpath(source))) {
      throw new Error("Build boundary rejects redirected state entries");
    }
    sources.push({ name, source });
  }

  if (sources.length) {
    const quarantine = path.join(nextRoot, `build-state-quarantine-${randomUUID()}`);
    if (!within(root, quarantine) || within(standalone, quarantine)) {
      throw new Error("Invalid build quarantine boundary");
    }
    await mkdir(quarantine, { mode: 0o700 });
    for (const { name, source } of sources) {
      const destination = path.join(quarantine, name);
      if (!within(quarantine, destination)) throw new Error("Invalid state destination");
      await rename(source, destination);
    }
  }
  return { quarantinedEntries: sources.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await sanitizeStandalone(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
    console.log(`[build-boundary] passed; quarantined local state entries=${result.quarantinedEntries}`);
  } catch {
    console.error("[build-boundary] failed; do not distribute this standalone artifact");
    process.exitCode = 1;
  }
}
