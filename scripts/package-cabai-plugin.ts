import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateSkillArtifactArchive } from "../src/lib/skill-artifacts/archive-validator";

const PLUGINS = { cabai: "cabai", "cabai-admin": "cabai-admin" } as const;
type PluginName = keyof typeof PLUGINS;

const crc32Table = new Uint32Array(256);
for (let index = 0; index < crc32Table.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crc32Table[index] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (crc32Table[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let localOffset = 0;
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(entry.content.length, 18);
    local.writeUInt32LE(entry.content.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    localRecords.push(local, name, entry.content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12);
    central.writeUInt16LE(33, 14); central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.content.length, 20); central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(localOffset, 42);
    centralRecords.push(central, name);
    localOffset += local.length + name.length + entry.content.length;
  }
  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

async function readCanonicalText(filePath: string): Promise<Buffer> {
  const text = await readFile(filePath, "utf8");
  return Buffer.from(text.replace(/\r\n?/gu, "\n"), "utf8");
}

async function main(): Promise<void> {
  const pluginName = (process.argv[2] ?? "cabai") as PluginName;
  if (!(pluginName in PLUGINS)) throw new Error(`Unknown plugin ${pluginName}. Expected cabai or cabai-admin.`);
  const internalFlag = process.argv[3] === "--internal";
  if (pluginName === "cabai-admin" && !internalFlag) {
    throw new Error("Packaging cabai-admin requires the explicit --internal flag.");
  }
  const root = process.cwd();
  const pluginRoot = path.join(root, "plugins", pluginName);
  const nestedSkillPath = `skills/${PLUGINS[pluginName]}/SKILL.md`;
  const [portableManifest, compatibilityManifest, skillMarkdown] = await Promise.all([
    readCanonicalText(path.join(pluginRoot, "plugin.json")),
    readCanonicalText(path.join(pluginRoot, ".codex-plugin", "plugin.json")),
    readCanonicalText(path.join(pluginRoot, nestedSkillPath)),
  ]);
  const manifest = JSON.parse(portableManifest.toString("utf8")) as { name?: string; version?: string; description?: string; repository?: string };
  const compatibility = JSON.parse(compatibilityManifest.toString("utf8")) as { name?: string; version?: string; description?: string; repository?: string };
  if (!manifest.version) throw new Error(`${pluginName}/plugin.json is missing version.`);
  if (manifest.name !== pluginName || compatibility.name !== pluginName || manifest.version !== compatibility.version || manifest.description !== compatibility.description) {
    throw new Error(`${pluginName} portable and compatibility manifests are not aligned.`);
  }
  if (pluginName === "cabai" && (manifest.repository || compatibility.repository)) {
    throw new Error("The public CabAI bundle must not embed an unapproved repository destination.");
  }
  const archive = createStoredZip([
    { name: ".codex-plugin/plugin.json", content: compatibilityManifest },
    { name: "SKILL.md", content: skillMarkdown },
    { name: "plugin.json", content: portableManifest },
    { name: nestedSkillPath, content: skillMarkdown },
  ]);
  const validation = validateSkillArtifactArchive(archive);
  if (!validation.ok) throw new Error(`Generated archive failed CabAI validation: ${JSON.stringify(validation.issues)}`);
  const outputArgument = process.argv[internalFlag ? 4 : 3];
  const outputPath = path.resolve(root, outputArgument ?? path.join("tmp", "plugins", `${pluginName}-${manifest.version}.zip`));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, archive);
  console.log(JSON.stringify({ plugin: pluginName, version: manifest.version, outputPath, checksumSha256: validation.value.checksumSha256, manifest: validation.value.manifest }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
