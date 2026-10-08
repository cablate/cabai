import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  SKILL_ARTIFACT_ISSUE_CODES,
  SKILL_ARTIFACT_LIMITS,
  validateSkillArtifactArchive,
  type SkillArtifactArchiveValidationResult,
  type SkillArtifactIssueCode,
  type SkillArtifactLimitOverrides,
} from "./archive-validator";

interface ZipFixtureEntry {
  path?: string;
  nameBytes?: Buffer;
  content?: string | Uint8Array;
  compressionMethod?: number;
  flags?: number;
  versionNeeded?: number;
  localVersionNeeded?: number;
  externalAttributes?: number;
  diskStart?: number;
  centralExtra?: Buffer;
  localExtra?: Buffer;
  centralCrc32?: number;
  localCrc32?: number;
  centralCompressedSize?: number;
  localCompressedSize?: number;
  centralUncompressedSize?: number;
  localUncompressedSize?: number;
  compressedSuffix?: Uint8Array;
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = (crcTable[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function asBuffer(content: string | Uint8Array | undefined): Buffer {
  if (typeof content === "string") return Buffer.from(content, "utf8");
  return content ? Buffer.from(content) : Buffer.alloc(0);
}

function buildZip(entries: ZipFixtureEntry[]): Buffer {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = entry.nameBytes ?? Buffer.from(entry.path ?? "", "utf8");
    const content = asBuffer(entry.content);
    const compressionMethod = entry.compressionMethod ?? 0;
    const compressedBody = compressionMethod === 8 ? deflateRawSync(content) : Buffer.from(content);
    const compressed = Buffer.concat([
      compressedBody,
      Buffer.from(entry.compressedSuffix ?? []),
    ]);
    const actualCrc32 = crc32(content);
    const flags = entry.flags ?? 0;
    const versionNeeded = entry.versionNeeded ?? 20;
    const localExtra = entry.localExtra ?? Buffer.alloc(0);
    const centralExtra = entry.centralExtra ?? Buffer.alloc(0);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(entry.localVersionNeeded ?? versionNeeded, 4);
    localHeader.writeUInt16LE(flags, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt32LE(entry.localCrc32 ?? actualCrc32, 14);
    localHeader.writeUInt32LE(entry.localCompressedSize ?? compressed.length, 18);
    localHeader.writeUInt32LE(entry.localUncompressedSize ?? content.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(localExtra.length, 28);
    const localRecord = Buffer.concat([localHeader, nameBytes, localExtra, compressed]);
    localRecords.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4);
    centralHeader.writeUInt16LE(versionNeeded, 6);
    centralHeader.writeUInt16LE(flags, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt32LE(entry.centralCrc32 ?? actualCrc32, 16);
    centralHeader.writeUInt32LE(entry.centralCompressedSize ?? compressed.length, 20);
    centralHeader.writeUInt32LE(entry.centralUncompressedSize ?? content.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(centralExtra.length, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(entry.diskStart ?? 0, 34);
    centralHeader.writeUInt32LE((entry.externalAttributes ?? 0) >>> 0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralRecords.push(Buffer.concat([centralHeader, nameBytes, centralExtra]));
    localOffset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, eocd]);
}

function insertGapBeforeCentralDirectory(archive: Buffer): Buffer {
  const originalEocdOffset = archive.length - 22;
  const centralDirectoryOffset = archive.readUInt32LE(originalEocdOffset + 16);
  const withGap = Buffer.concat([
    archive.subarray(0, centralDirectoryOffset),
    Buffer.from([0]),
    archive.subarray(centralDirectoryOffset),
  ]);
  const newEocdOffset = originalEocdOffset + 1;
  withGap.writeUInt32LE(centralDirectoryOffset + 1, newEocdOffset + 16);
  return withGap;
}

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function expectIssue(
  archive: Uint8Array,
  code: SkillArtifactIssueCode,
  limits?: SkillArtifactLimitOverrides,
  path?: string,
): SkillArtifactArchiveValidationResult & { ok: false } {
  const result = validateSkillArtifactArchive(archive, limits);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected archive validation to fail");
  expect(result.checksumSha256).toBe(checksum(archive));
  expect(result.issues).toHaveLength(1);
  expect(result.issues[0]?.code).toBe(code);
  if (path !== undefined) expect(result.issues[0]?.path).toBe(path);
  return result;
}

const skillMarkdown = [
  "---",
  "name: Archive validator",
  "description: >-",
  "  Safely inspect ZIP data",
  "ignored:",
  "  nested: true",
  "---",
  "# Skill",
  "",
].join("\n");

describe("validateSkillArtifactArchive", () => {
  it("exports the WP-03 limits and stable issue code registry", () => {
    expect(SKILL_ARTIFACT_LIMITS).toEqual({
      compressedBytes: 20 * 1024 * 1024,
      uncompressedBytes: 100 * 1024 * 1024,
      entryBytes: 20 * 1024 * 1024,
      entryCount: 1_000,
      pathDepth: 16,
      skillMarkdownBytes: 256 * 1024,
    });
    expect(new Set(SKILL_ARTIFACT_ISSUE_CODES)).toEqual(new Set([
      "invalid_zip",
      "encrypted_entry",
      "unsupported_zip64",
      "unsupported_compression",
      "unsafe_path",
      "duplicate_path",
      "symlink",
      "nested_archive",
      "too_many_entries",
      "compressed_too_large",
      "entry_too_large",
      "uncompressed_too_large",
      "path_too_deep",
      "missing_skill_markdown",
      "duplicate_skill_markdown",
      "invalid_skill_markdown",
    ]));
  });

  it("validates stored entries and returns an exact JSON-safe manifest projection", () => {
    const guide = Buffer.from("Guide\n", "utf8");
    const archive = buildZip([
      { path: "docs/", content: "" },
      { path: "docs/guide.md", content: guide },
      { path: "SKILL.md", content: skillMarkdown },
    ]);

    const result = validateSkillArtifactArchive(archive);

    expect(result).toEqual({
      ok: true,
      value: {
        checksumSha256: checksum(archive),
        manifest: {
          skillMarkdownSha256: checksum(Buffer.from(skillMarkdown)),
          name: "Archive validator",
          description: "Safely inspect ZIP data",
          fileCount: 2,
          uncompressedBytes: Buffer.byteLength(skillMarkdown) + guide.length,
          paths: ["SKILL.md", "docs/guide.md"],
        },
      },
    });
    if (result.ok) {
      expect(JSON.parse(JSON.stringify(result.value.manifest))).toEqual(result.value.manifest);
    }
  });

  it("validates bounded deflate entries and leaves absent or non-scalar metadata null", () => {
    const markdown = [
      "---",
      "name:",
      "  nested: ignored",
      "description:",
      "  - ignored",
      "---",
      "# Deflated",
    ].join("\n");
    const archive = buildZip([
      { path: "z.txt", content: "last", compressionMethod: 8 },
      { path: "SKILL.md", content: markdown, compressionMethod: 8 },
      { path: "a.txt", content: "first", compressionMethod: 8 },
    ]);

    const result = validateSkillArtifactArchive(archive);

    expect(result).toMatchObject({
      ok: true,
      value: {
        checksumSha256: checksum(archive),
        manifest: {
          name: null,
          description: null,
          fileCount: 3,
          paths: ["SKILL.md", "a.txt", "z.txt"],
        },
      },
    });
  });

  it.each([
    ["not a ZIP", Buffer.from("not a zip")],
    ["data descriptor", buildZip([{ path: "SKILL.md", content: "# Skill", flags: 0x0008 }])],
    ["CRC mismatch", buildZip([{ path: "SKILL.md", content: "# Skill", centralCrc32: 1, localCrc32: 1 }])],
    ["local metadata mismatch", buildZip([{ path: "SKILL.md", content: "# Skill", localUncompressedSize: 1 }])],
    ["deflate trailing bytes", buildZip([{
      path: "SKILL.md",
      content: "# Skill",
      compressionMethod: 8,
      compressedSuffix: Uint8Array.from([0xde, 0xad]),
    }])],
    ["deflate expands beyond its declaration", buildZip([{
      path: "SKILL.md",
      content: Buffer.alloc(4_096, 0x61),
      compressionMethod: 8,
      centralUncompressedSize: 1,
      localUncompressedSize: 1,
    }])],
    ["gap before central directory", insertGapBeforeCentralDirectory(buildZip([{
      path: "SKILL.md",
      content: "# Skill",
    }]))],
  ])("rejects ambiguous or corrupt ZIP structure: %s", (_label, archive) => {
    expectIssue(archive, "invalid_zip");
  });

  it("rejects multi-disk metadata", () => {
    const archive = buildZip([{ path: "SKILL.md", content: "# Skill" }]);
    archive.writeUInt16LE(1, archive.length - 22 + 4);
    expectIssue(archive, "invalid_zip");
  });

  it.each([
    ["encrypted_entry", buildZip([{ path: "SKILL.md", content: "secret", flags: 0x0001 }])],
    ["unsupported_zip64", buildZip([{
      path: "SKILL.md",
      content: "# Skill",
      centralExtra: Buffer.from([0x01, 0x00, 0x00, 0x00]),
      localExtra: Buffer.from([0x01, 0x00, 0x00, 0x00]),
    }])],
    ["unsupported_compression", buildZip([{
      path: "SKILL.md",
      content: "# Skill",
      compressionMethod: 12,
    }])],
  ] as const)("returns the stable %s issue", (code, archive) => {
    expectIssue(archive, code);
  });

  it.each([
    "../outside.txt",
    "/absolute.txt",
    "C:/drive.txt",
    "folder\\file.txt",
    "folder//file.txt",
    "./file.txt",
    "folder/../file.txt",
    "nul\0file.txt",
  ])("rejects unsafe path %s", (unsafePath) => {
    const archive = buildZip([
      { path: "SKILL.md", content: "# Skill" },
      { path: unsafePath, content: "x" },
    ]);
    expectIssue(archive, "unsafe_path", undefined, unsafePath);
  });

  it("rejects non-UTF-8 path bytes", () => {
    const archive = buildZip([
      { path: "SKILL.md", content: "# Skill" },
      { nameBytes: Buffer.from([0xff]), content: "x", flags: 0x0800 },
    ]);
    expectIssue(archive, "unsafe_path");
  });

  it("rejects alternate Unicode path extra fields", () => {
    const unicodePathExtra = Buffer.from([0x75, 0x70, 0x00, 0x00]);
    const archive = buildZip([
      { path: "SKILL.md", content: "# Skill" },
      {
        path: "safe.txt",
        content: "x",
        centralExtra: unicodePathExtra,
        localExtra: unicodePathExtra,
      },
    ]);
    expectIssue(archive, "unsafe_path", undefined, "safe.txt");
  });

  it("distinguishes duplicate ordinary paths from duplicate root SKILL.md", () => {
    expectIssue(buildZip([
      { path: "SKILL.md", content: "# Skill" },
      { path: "same.txt", content: "one" },
      { path: "same.txt", content: "two" },
    ]), "duplicate_path", undefined, "same.txt");

    expectIssue(buildZip([
      { path: "SKILL.md", content: "one" },
      { path: "SKILL.md", content: "two" },
    ]), "duplicate_skill_markdown", undefined, "SKILL.md");
  });

  it("rejects Unix symlinks", () => {
    const archive = buildZip([
      { path: "SKILL.md", content: "# Skill" },
      {
        path: "link",
        content: "target",
        externalAttributes: (0o120777 << 16) >>> 0,
      },
    ]);
    expectIssue(archive, "symlink", undefined, "link");
  });

  it.each([
    ["extension", { path: "payload.zip", content: "not even a real zip" }],
    ["ZIP magic", { path: "payload.bin", content: Buffer.from([0x50, 0x4b, 0x03, 0x04]), compressionMethod: 8 }],
    ["7z magic", { path: "payload.bin", content: Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), compressionMethod: 8 }],
    ["RAR magic", { path: "payload.bin", content: Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) }],
    ["gzip magic", { path: "payload.bin", content: Buffer.from([0x1f, 0x8b, 0x08]) }],
  ] as const)("rejects nested archives by %s", (_label, nestedEntry) => {
    const archive = buildZip([
      { path: "SKILL.md", content: "# Skill" },
      nestedEntry,
    ]);
    expectIssue(archive, "nested_archive", undefined, nestedEntry.path);
  });

  it("enforces every configured hard bound before or during decompression", () => {
    const twoEntries = buildZip([
      { path: "SKILL.md", content: "# Skill" },
      { path: "file.txt", content: "data" },
    ]);
    expectIssue(twoEntries, "compressed_too_large", { compressedBytes: twoEntries.length - 1 });
    expectIssue(twoEntries, "too_many_entries", { entryCount: 1 });
    expectIssue(twoEntries, "entry_too_large", { entryBytes: Buffer.byteLength("# Skill") - 1 }, "SKILL.md");
    expectIssue(
      twoEntries,
      "uncompressed_too_large",
      { uncompressedBytes: Buffer.byteLength("# Skill") + 1 },
      "file.txt",
    );

    const deep = buildZip([
      { path: "SKILL.md", content: "# Skill" },
      { path: "one/two/three.txt", content: "x" },
    ]);
    expectIssue(deep, "path_too_deep", { pathDepth: 2 }, "one/two/three.txt");

    const largeSkill = buildZip([{ path: "SKILL.md", content: "# Skill" }]);
    expectIssue(
      largeSkill,
      "invalid_skill_markdown",
      { skillMarkdownBytes: Buffer.byteLength("# Skill") - 1 },
      "SKILL.md",
    );
  });

  it("requires exactly one case-sensitive root SKILL.md", () => {
    expectIssue(buildZip([{ path: "nested/SKILL.md", content: "# Nested" }]), "missing_skill_markdown");
    expectIssue(buildZip([{ path: "skill.md", content: "# Wrong case" }]), "missing_skill_markdown");
  });

  it.each([
    ["empty", Buffer.alloc(0)],
    ["blank", Buffer.from(" \n\t")],
    ["NUL", Buffer.from("# Skill\0")],
    ["invalid UTF-8", Buffer.from([0xff, 0xfe])],
    ["unclosed frontmatter", Buffer.from("---\nname: broken\n# body")],
    ["invalid frontmatter", Buffer.from("---\nname: [broken\n---\n# body")],
  ])("rejects invalid root SKILL.md content: %s", (_label, content) => {
    const archive = buildZip([{ path: "SKILL.md", content }]);
    expectIssue(archive, "invalid_skill_markdown", undefined, "SKILL.md");
  });

  it("throws only for invalid caller-supplied limit overrides", () => {
    const archive = buildZip([{ path: "SKILL.md", content: "# Skill" }]);
    expect(() => validateSkillArtifactArchive(archive, { entryCount: -1 })).toThrow(RangeError);
    expect(() => validateSkillArtifactArchive(archive, {
      entryCount: SKILL_ARTIFACT_LIMITS.entryCount + 1,
    })).toThrow(RangeError);
  });
});
