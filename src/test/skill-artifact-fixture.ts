import {
  StorageObjectNotFoundError,
  StorageProviderError,
  type StorageProvider,
  type StoredObjectMetadata,
  type UploadTargetInput,
} from "@/lib/storage";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZip(entries: Record<string, string | Uint8Array>): Uint8Array {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [path, value] of Object.entries(entries)) {
    const name = Buffer.from(path, "utf8");
    const body = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
    const checksum = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + body.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export const VALID_SKILL_ZIP = createStoredZip({
  "SKILL.md": "---\nname: fixture-skill\ndescription: Safe integration fixture\n---\n\n# Fixture Skill\n",
  "references/example.md": "# Example\n",
});

export class MemoryStorageProvider implements StorageProvider {
  readonly kind = "local" as const;
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  put(key: string, bytes: Uint8Array, contentType = "application/zip"): void {
    this.objects.set(key, { bytes: Uint8Array.from(bytes), contentType });
  }

  async createUploadTarget(input: UploadTargetInput): Promise<string> {
    return `https://storage.test/upload/${encodeURIComponent(input.key)}`;
  }

  async createDownloadTarget(key: string): Promise<string> {
    if (!this.objects.has(key)) throw new StorageObjectNotFoundError();
    return `https://storage.test/download/${encodeURIComponent(key)}`;
  }

  publicUrl(key: string): string {
    return `https://storage.test/public/${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async head(key: string): Promise<StoredObjectMetadata> {
    const object = this.objects.get(key);
    if (!object) throw new StorageObjectNotFoundError();
    return { contentLength: object.bytes.byteLength, contentType: object.contentType };
  }

  async readObject(key: string, maxBytes: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new StorageProviderError("INVALID_METADATA", "Read limit must be a positive safe integer.");
    }
    const object = this.objects.get(key);
    if (!object) throw new StorageObjectNotFoundError();
    if (object.bytes.byteLength > maxBytes) {
      throw new StorageProviderError("OBJECT_TOO_LARGE", "Stored object exceeds the read limit.");
    }
    return Uint8Array.from(object.bytes);
  }
}
