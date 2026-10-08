import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { isMap, isScalar, parseDocument } from "yaml";

const MEBIBYTE = 1024 * 1024;

export const SKILL_ARTIFACT_LIMITS = {
  compressedBytes: 20 * MEBIBYTE,
  uncompressedBytes: 100 * MEBIBYTE,
  entryBytes: 20 * MEBIBYTE,
  entryCount: 1_000,
  pathDepth: 16,
  skillMarkdownBytes: 256 * 1024,
} as const;

export const SKILL_ARTIFACT_ISSUE_CODES = [
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
] as const;

export type SkillArtifactIssueCode = (typeof SKILL_ARTIFACT_ISSUE_CODES)[number];
export type SkillArtifactLimitOverrides = Partial<Record<keyof typeof SKILL_ARTIFACT_LIMITS, number>>;

export interface SkillArtifactValidationIssue {
  code: SkillArtifactIssueCode;
  path?: string;
  message: string;
}

export interface SkillArtifactManifest {
  skillMarkdownSha256: string;
  name: string | null;
  description: string | null;
  fileCount: number;
  uncompressedBytes: number;
  paths: string[];
}

export type SkillArtifactArchiveValidationResult =
  | {
      ok: true;
      value: {
        checksumSha256: string;
        manifest: SkillArtifactManifest;
      };
    }
  | {
      ok: false;
      checksumSha256: string;
      issues: SkillArtifactValidationIssue[];
    };

type ResolvedLimits = Record<keyof typeof SKILL_ARTIFACT_LIMITS, number>;

interface EndOfCentralDirectory {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entryCount: number;
  offset: number;
}

interface CentralEntry {
  path: string;
  isDirectory: boolean;
  nameBytes: Buffer;
  versionNeeded: number;
  flags: number;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

interface LocatedEntry extends CentralEntry {
  compressed: Buffer;
  localEnd: number;
}

class ArchiveValidationError extends Error {
  constructor(
    readonly code: SkillArtifactIssueCode,
    message: string,
    readonly path?: string,
  ) {
    super(message);
  }
}

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP64_END_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;
const UNICODE_PATH_EXTRA_FIELD_ID = 0x7075;
const ENCRYPTION_FLAGS = 0x0001 | 0x0040 | 0x2000;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const UTF8_FLAG = 0x0800;

const nestedArchiveExtensions = [
  ".zip",
  ".zipx",
  ".7z",
  ".rar",
  ".gz",
  ".gzip",
  ".tgz",
  ".tar",
  ".tar.gz",
  ".bz2",
  ".tbz",
  ".tbz2",
  ".xz",
  ".txz",
  ".zst",
  ".jar",
  ".war",
  ".ear",
  ".apk",
  ".ipa",
  ".docx",
  ".xlsx",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".epub",
  ".cbz",
] as const;

const crc32Table = new Uint32Array(256);
for (let index = 0; index < crc32Table.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crc32Table[index] = value >>> 0;
}

function fail(code: SkillArtifactIssueCode, message: string, path?: string): never {
  throw new ArchiveValidationError(code, message, path);
}

function resolveLimits(overrides: SkillArtifactLimitOverrides): ResolvedLimits {
  const limits = { ...SKILL_ARTIFACT_LIMITS, ...overrides } as ResolvedLimits;
  for (const name of Object.keys(SKILL_ARTIFACT_LIMITS) as Array<keyof ResolvedLimits>) {
    const value = limits[name];
    if (!Number.isSafeInteger(value) || value < 0 || value > SKILL_ARTIFACT_LIMITS[name]) {
      throw new RangeError(
        `${name} must be a non-negative safe integer no greater than ${SKILL_ARTIFACT_LIMITS[name]}`,
      );
    }
  }
  return limits;
}

function ensureRange(buffer: Buffer, offset: number, length: number): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > buffer.length
  ) {
    fail("invalid_zip", "ZIP record extends outside the archive.");
  }
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = (crc32Table[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < 22) fail("invalid_zip", "ZIP end-of-central-directory record is missing.");
  const minimumOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset--) {
    if (buffer.readUInt32LE(offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  fail("invalid_zip", "ZIP end-of-central-directory record is missing or ambiguous.");
}

function readEndOfCentralDirectory(buffer: Buffer, limits: ResolvedLimits): EndOfCentralDirectory {
  const offset = findEndOfCentralDirectory(buffer);
  if (
    offset >= 20 && buffer.readUInt32LE(offset - 20) === ZIP64_LOCATOR_SIGNATURE ||
    offset >= 12 && buffer.readUInt32LE(offset - 12) === ZIP64_END_SIGNATURE
  ) {
    fail("unsupported_zip64", "ZIP64 archives are not supported.");
  }

  const diskNumber = buffer.readUInt16LE(offset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(offset + 6);
  const entriesOnDisk = buffer.readUInt16LE(offset + 8);
  const entryCount = buffer.readUInt16LE(offset + 10);
  const centralDirectorySize = buffer.readUInt32LE(offset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(offset + 16);

  if (
    entriesOnDisk === 0xffff ||
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    fail("unsupported_zip64", "ZIP64 archive metadata is not supported.");
  }
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    fail("invalid_zip", "Multi-disk ZIP archives are not supported.");
  }
  if (entryCount > limits.entryCount) {
    fail("too_many_entries", `ZIP contains more than ${limits.entryCount} entries.`);
  }
  if (centralDirectoryOffset + centralDirectorySize !== offset) {
    fail("invalid_zip", "ZIP central directory bounds are inconsistent.");
  }
  ensureRange(buffer, centralDirectoryOffset, centralDirectorySize);

  return { centralDirectoryOffset, centralDirectorySize, entryCount, offset };
}

function inspectExtraFields(extra: Buffer, path?: string): void {
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) {
      fail("invalid_zip", "ZIP extra field header is truncated.", path);
    }
    const fieldId = extra.readUInt16LE(cursor);
    const fieldLength = extra.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + fieldLength > extra.length) {
      fail("invalid_zip", "ZIP extra field value is truncated.", path);
    }
    if (fieldId === ZIP64_EXTRA_FIELD_ID) {
      fail("unsupported_zip64", "ZIP64 extra fields are not supported.", path);
    }
    if (fieldId === UNICODE_PATH_EXTRA_FIELD_ID) {
      fail("unsafe_path", "ZIP entries must not declare an alternate Unicode path.", path);
    }
    cursor += fieldLength;
  }
}

function inspectEntryEncoding(flags: number, compressionMethod: number, path?: string): void {
  if ((flags & ENCRYPTION_FLAGS) !== 0) {
    fail("encrypted_entry", "Encrypted ZIP entries are not supported.", path);
  }
  if ((flags & DATA_DESCRIPTOR_FLAG) !== 0) {
    fail("invalid_zip", "ZIP data descriptors are not supported.", path);
  }
  if (compressionMethod !== 0 && compressionMethod !== 8) {
    fail(
      "unsupported_compression",
      `ZIP compression method ${compressionMethod} is not supported.`,
      path,
    );
  }
  const allowedFlags = UTF8_FLAG | (compressionMethod === 8 ? 0x0006 : 0);
  if ((flags & ~allowedFlags) !== 0) {
    fail("invalid_zip", "ZIP entry uses unsupported general-purpose flags.", path);
  }
}

function decodeEntryPath(nameBytes: Buffer, flags: number): string {
  if (nameBytes.length === 0) fail("unsafe_path", "ZIP entry path must not be empty.");
  if ((flags & UTF8_FLAG) === 0 && nameBytes.some((byte) => byte >= 0x80)) {
    fail("unsafe_path", "Non-ASCII ZIP paths must declare UTF-8 encoding.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
  } catch {
    fail("unsafe_path", "ZIP entry path is not valid UTF-8.");
  }
}

function validateEntryPath(rawPath: string, limits: ResolvedLimits): {
  path: string;
  isDirectory: boolean;
} {
  if (rawPath.includes("\0") || rawPath.includes("\\")) {
    fail("unsafe_path", "ZIP paths must not contain NUL or backslash characters.", rawPath);
  }
  if (rawPath.startsWith("/") || /^[A-Za-z]:/u.test(rawPath)) {
    fail("unsafe_path", "ZIP paths must be relative and must not use drive prefixes.", rawPath);
  }

  // A single trailing slash is a directory marker, not an empty path segment.
  const isDirectory = rawPath.endsWith("/");
  const path = isDirectory ? rawPath.slice(0, -1) : rawPath;
  const segments = path.split("/");
  if (
    path.length === 0 ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    fail("unsafe_path", "ZIP paths must contain only non-empty canonical segments.", rawPath);
  }
  if (segments.length > limits.pathDepth) {
    fail("path_too_deep", `ZIP path exceeds ${limits.pathDepth} segments.`, path);
  }
  return { path, isDirectory };
}

function isUnixSymlink(externalAttributes: number): boolean {
  const unixMode = (externalAttributes >>> 16) & 0xffff;
  return (unixMode & 0xf000) === 0xa000;
}

function hasDangerousArchiveExtension(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return nestedArchiveExtensions.some((extension) => lowerPath.endsWith(extension));
}

function parseCentralEntries(
  buffer: Buffer,
  eocd: EndOfCentralDirectory,
  limits: ResolvedLimits,
): { entries: CentralEntry[]; uncompressedBytes: number; paths: string[] } {
  const entries: CentralEntry[] = [];
  const paths: string[] = [];
  const seenPaths = new Map<string, { isDirectory: boolean }>();
  const centralDirectoryEnd = eocd.centralDirectoryOffset + eocd.centralDirectorySize;
  let cursor = eocd.centralDirectoryOffset;
  let uncompressedBytes = 0;
  let skillMarkdownCount = 0;

  for (let index = 0; index < eocd.entryCount; index++) {
    ensureRange(buffer, cursor, 46);
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      fail("invalid_zip", "ZIP central directory entry signature is invalid.");
    }

    const versionNeeded = buffer.readUInt16LE(cursor + 6);
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const entryCrc32 = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const diskStart = buffer.readUInt16LE(cursor + 34);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    ensureRange(buffer, cursor, recordLength);
    if (cursor + recordLength > centralDirectoryEnd) {
      fail("invalid_zip", "ZIP central directory entry exceeds its declared bounds.");
    }
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      diskStart === 0xffff ||
      versionNeeded === 45
    ) {
      fail("unsupported_zip64", "ZIP64 entry metadata is not supported.");
    }
    if (diskStart !== 0) fail("invalid_zip", "Multi-disk ZIP entries are not supported.");

    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const decodedPath = decodeEntryPath(nameBytes, flags);
    const { path, isDirectory } = validateEntryPath(decodedPath, limits);
    const extra = buffer.subarray(
      cursor + 46 + nameLength,
      cursor + 46 + nameLength + extraLength,
    );
    inspectExtraFields(extra, path);
    inspectEntryEncoding(flags, compressionMethod, path);

    const previous = seenPaths.get(path);
    if (previous) {
      if (path === "SKILL.md" && !previous.isDirectory && !isDirectory) {
        fail("duplicate_skill_markdown", "ZIP contains duplicate root SKILL.md entries.", path);
      }
      fail("duplicate_path", "ZIP contains duplicate canonical paths.", path);
    }
    seenPaths.set(path, { isDirectory });

    if (isUnixSymlink(externalAttributes)) {
      fail("symlink", "ZIP contains a Unix symbolic link.", path);
    }
    if (isDirectory && uncompressedSize !== 0) {
      fail("invalid_zip", "ZIP directory entries must not contain file data.", path);
    }
    if (uncompressedSize > limits.entryBytes) {
      fail("entry_too_large", `ZIP entry exceeds ${limits.entryBytes} bytes.`, path);
    }
    uncompressedBytes += uncompressedSize;
    if (uncompressedBytes > limits.uncompressedBytes) {
      fail(
        "uncompressed_too_large",
        `ZIP expands beyond ${limits.uncompressedBytes} aggregate bytes.`,
        path,
      );
    }

    if (!isDirectory) {
      paths.push(path);
      if (hasDangerousArchiveExtension(path)) {
        fail("nested_archive", "ZIP contains a nested archive by file extension.", path);
      }
      if (path === "SKILL.md") {
        skillMarkdownCount++;
        if (uncompressedSize > limits.skillMarkdownBytes) {
          fail(
            "invalid_skill_markdown",
            `Root SKILL.md exceeds ${limits.skillMarkdownBytes} bytes.`,
            path,
          );
        }
      }
    }

    entries.push({
      path,
      isDirectory,
      nameBytes,
      versionNeeded,
      flags,
      compressionMethod,
      crc32: entryCrc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor += recordLength;
  }

  if (cursor !== centralDirectoryEnd) {
    fail("invalid_zip", "ZIP central directory size does not match its entries.");
  }
  if (skillMarkdownCount === 0) {
    fail("missing_skill_markdown", "ZIP must contain one root SKILL.md file.");
  }
  if (skillMarkdownCount !== 1) {
    fail("duplicate_skill_markdown", "ZIP must contain exactly one root SKILL.md file.", "SKILL.md");
  }

  return { entries, uncompressedBytes, paths: paths.sort() };
}

function locateEntries(
  buffer: Buffer,
  entries: CentralEntry[],
  centralDirectoryOffset: number,
): LocatedEntry[] {
  const located: LocatedEntry[] = [];
  for (const entry of entries) {
    ensureRange(buffer, entry.localHeaderOffset, 30);
    if (
      entry.localHeaderOffset >= centralDirectoryOffset ||
      buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_HEADER_SIGNATURE
    ) {
      fail("invalid_zip", "ZIP local file header is missing or misplaced.", entry.path);
    }

    const versionNeeded = buffer.readUInt16LE(entry.localHeaderOffset + 4);
    const flags = buffer.readUInt16LE(entry.localHeaderOffset + 6);
    const compressionMethod = buffer.readUInt16LE(entry.localHeaderOffset + 8);
    const entryCrc32 = buffer.readUInt32LE(entry.localHeaderOffset + 14);
    const compressedSize = buffer.readUInt32LE(entry.localHeaderOffset + 18);
    const uncompressedSize = buffer.readUInt32LE(entry.localHeaderOffset + 22);
    const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
    const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
    const headerLength = 30 + nameLength + extraLength;
    ensureRange(buffer, entry.localHeaderOffset, headerLength);
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      versionNeeded === 45
    ) {
      fail("unsupported_zip64", "ZIP64 local entry metadata is not supported.", entry.path);
    }
    inspectEntryEncoding(flags, compressionMethod, entry.path);

    const localName = buffer.subarray(
      entry.localHeaderOffset + 30,
      entry.localHeaderOffset + 30 + nameLength,
    );
    const localExtra = buffer.subarray(
      entry.localHeaderOffset + 30 + nameLength,
      entry.localHeaderOffset + headerLength,
    );
    inspectExtraFields(localExtra, entry.path);

    if (
      versionNeeded !== entry.versionNeeded ||
      flags !== entry.flags ||
      compressionMethod !== entry.compressionMethod ||
      entryCrc32 !== entry.crc32 ||
      compressedSize !== entry.compressedSize ||
      uncompressedSize !== entry.uncompressedSize ||
      !localName.equals(entry.nameBytes)
    ) {
      fail("invalid_zip", "ZIP local and central entry metadata do not match.", entry.path);
    }
    if (compressionMethod === 0 && compressedSize !== uncompressedSize) {
      fail("invalid_zip", "Stored ZIP entry sizes do not match.", entry.path);
    }

    const dataOffset = entry.localHeaderOffset + headerLength;
    const localEnd = dataOffset + compressedSize;
    if (localEnd > centralDirectoryOffset) {
      fail("invalid_zip", "ZIP entry data overlaps the central directory.", entry.path);
    }
    ensureRange(buffer, dataOffset, compressedSize);
    located.push({
      ...entry,
      compressed: buffer.subarray(dataOffset, localEnd),
      localEnd,
    });
  }

  const byOffset = [...located].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset);
  let expectedOffset = 0;
  for (const current of byOffset) {
    if (current.localHeaderOffset !== expectedOffset) {
      fail("invalid_zip", "ZIP local entries contain an unsupported preamble, gap, or overlap.", current.path);
    }
    expectedOffset = current.localEnd;
  }
  if (expectedOffset !== centralDirectoryOffset) {
    fail("invalid_zip", "ZIP contains unsupported data between local entries and the central directory.");
  }
  return located;
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function hasNestedArchiveMagic(bytes: Uint8Array): boolean {
  return (
    startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08]) ||
    startsWithBytes(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
    startsWithBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) ||
    startsWithBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00]) ||
    startsWithBytes(bytes, [0x1f, 0x8b])
  );
}

function inflateAndVerifyEntries(entries: LocatedEntry[]): Buffer {
  let skillMarkdown: Buffer | null = null;

  for (const entry of entries) {
    let content: Buffer;
    if (entry.compressionMethod === 0) {
      content = entry.compressed;
    } else {
      try {
        const result = inflateRawSync(entry.compressed, {
          info: true,
          maxOutputLength: Math.max(1, entry.uncompressedSize),
        }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
        if (result.engine.bytesWritten !== entry.compressed.length) {
          fail("invalid_zip", "Deflated ZIP entry contains trailing compressed data.", entry.path);
        }
        content = result.buffer;
      } catch (error) {
        if (error instanceof ArchiveValidationError) throw error;
        fail("invalid_zip", "Deflated ZIP entry could not be decoded within its bounds.", entry.path);
      }
    }

    if (content.length !== entry.uncompressedSize || crc32(content) !== entry.crc32) {
      fail("invalid_zip", "ZIP entry size or CRC-32 verification failed.", entry.path);
    }
    if (!entry.isDirectory && hasNestedArchiveMagic(content)) {
      fail("nested_archive", "ZIP entry content begins with an archive signature.", entry.path);
    }
    if (!entry.isDirectory && entry.path === "SKILL.md") skillMarkdown = content;
  }

  if (!skillMarkdown) {
    fail("missing_skill_markdown", "ZIP must contain one root SKILL.md file.");
  }
  return skillMarkdown;
}

function scalarString(document: ReturnType<typeof parseDocument>, key: string): string | null {
  if (!isMap(document.contents)) return null;
  const node = document.get(key, true);
  if (!isScalar(node)) return null;
  return typeof node.value === "string" ? node.value : null;
}

function inspectSkillMarkdown(bytes: Buffer): { name: string | null; description: string | null } {
  if (bytes.length === 0 || bytes.includes(0)) {
    fail("invalid_skill_markdown", "Root SKILL.md must be non-empty and contain no NUL bytes.", "SKILL.md");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("invalid_skill_markdown", "Root SKILL.md must be valid UTF-8.", "SKILL.md");
  }
  if (text.trim().length === 0) {
    fail("invalid_skill_markdown", "Root SKILL.md must not be blank.", "SKILL.md");
  }

  const normalized = text.startsWith("\ufeff") ? text.slice(1) : text;
  const lines = normalized.split(/\r?\n/u);
  if (lines[0]?.trim() !== "---") return { name: null, description: null };
  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex === -1) {
    fail("invalid_skill_markdown", "Root SKILL.md YAML frontmatter is not closed.", "SKILL.md");
  }

  const frontmatter = lines.slice(1, closingIndex).join("\n");
  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(frontmatter, {
      schema: "failsafe",
      strict: true,
      uniqueKeys: true,
    });
  } catch {
    fail("invalid_skill_markdown", "Root SKILL.md YAML frontmatter is invalid.", "SKILL.md");
  }
  if (document.errors.length > 0 || document.warnings.length > 0) {
    fail("invalid_skill_markdown", "Root SKILL.md YAML frontmatter is invalid.", "SKILL.md");
  }
  return {
    name: scalarString(document, "name"),
    description: scalarString(document, "description"),
  };
}

export function validateSkillArtifactArchive(
  bytes: Uint8Array,
  limitOverrides: SkillArtifactLimitOverrides = {},
): SkillArtifactArchiveValidationResult {
  const limits = resolveLimits(limitOverrides);
  const buffer = bytes.byteLength <= limits.compressedBytes ? Buffer.from(bytes) : null;
  const checksumSha256 = createHash("sha256").update(buffer ?? bytes).digest("hex");

  try {
    if (!buffer) {
      fail(
        "compressed_too_large",
        `ZIP archive exceeds ${limits.compressedBytes} compressed bytes.`,
      );
    }

    const eocd = readEndOfCentralDirectory(buffer, limits);
    const { entries, paths, uncompressedBytes } = parseCentralEntries(buffer, eocd, limits);
    const locatedEntries = locateEntries(buffer, entries, eocd.centralDirectoryOffset);
    const skillMarkdown = inflateAndVerifyEntries(locatedEntries);
    const frontmatter = inspectSkillMarkdown(skillMarkdown);

    return {
      ok: true,
      value: {
        checksumSha256,
        manifest: {
          skillMarkdownSha256: createHash("sha256").update(skillMarkdown).digest("hex"),
          name: frontmatter.name,
          description: frontmatter.description,
          fileCount: paths.length,
          uncompressedBytes,
          paths,
        },
      },
    };
  } catch (error) {
    const issue = error instanceof ArchiveValidationError
      ? { code: error.code, ...(error.path ? { path: error.path } : {}), message: error.message }
      : { code: "invalid_zip" as const, message: "ZIP archive is malformed." };
    return { ok: false, checksumSha256, issues: [issue] };
  }
}
