import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import type { StorageProvider, StoredObjectMetadata, UploadTargetInput } from "./types";
import { StorageObjectNotFoundError, StorageProviderError } from "./types";
import { assertStorageKey, assertUploadTargetInput, normalizeHttpOrigin } from "./validation";

interface StorageTokenPayload {
  operation: "upload" | "read";
  key: string;
  expiresAt: number;
  contentType?: string;
  contentLength?: number;
}

export class LocalStorageProvider implements StorageProvider {
  readonly kind = "local" as const;
  private readonly root: string;

  constructor(root: string, private readonly secret: string, private readonly appBaseUrl: string) {
    this.root = resolve(root);
    if (secret.length < 32) throw new Error("Local storage signing secret must be at least 32 characters.");
    this.appBaseUrl = normalizeHttpOrigin(appBaseUrl, "Local storage app URL", true);
  }

  async createUploadTarget(input: UploadTargetInput): Promise<string> {
    assertUploadTargetInput(input);
    const token = this.sign({
      operation: "upload",
      key: input.key,
      expiresAt: Date.now() + input.expiresIn * 1000,
      contentType: input.contentType,
      contentLength: input.contentLength,
    });
    return `${this.appBaseUrl}/api/storage/local/upload?token=${encodeURIComponent(token)}`;
  }

  async createDownloadTarget(key: string, expiresIn: number): Promise<string> {
    assertStorageKey(key);
    if (!Number.isSafeInteger(expiresIn) || expiresIn < 1) throw new StorageProviderError("INVALID_METADATA", "Download expiry must be a positive safe integer.");
    const token = this.sign({ operation: "read", key, expiresAt: Date.now() + expiresIn * 1000 });
    return `${this.appBaseUrl}/api/storage/local/read?token=${encodeURIComponent(token)}`;
  }

  publicUrl(key: string): string {
    return `${this.appBaseUrl}/api/storage/local/public/${this.encodeKey(key)}`;
  }

  async delete(key: string): Promise<void> {
    const path = this.objectPath(key);
    await Promise.all([rm(path, { force: true }), rm(`${path}.meta.json`, { force: true })]);
  }

  async head(key: string): Promise<StoredObjectMetadata> {
    const path = this.objectPath(key);
    try {
      const file = await stat(path);
      const metadata = await this.readMetadata(path);
      return { contentLength: file.size, contentType: metadata.contentType };
    } catch (error) {
      if (isFileNotFound(error)) throw new StorageObjectNotFoundError({ cause: error });
      throw error;
    }
  }

  async readObject(key: string, maxBytes: number): Promise<Uint8Array> {
    const path = this.objectPath(key);
    assertReadObjectMaxBytes(maxBytes);
    try {
      const file = await stat(path);
      if (file.size > maxBytes) throw objectTooLargeError();
      const bytes = await readFile(path);
      if (bytes.byteLength > maxBytes) throw objectTooLargeError();
      return new Uint8Array(bytes);
    } catch (error) {
      if (isFileNotFound(error)) throw new StorageObjectNotFoundError({ cause: error });
      throw error;
    }
  }

  async storeUpload(token: string, request: Request): Promise<void> {
    const payload = this.verify(token, "upload");
    if (typeof payload.contentLength !== "number" || !payload.contentType) throw new Error("Invalid upload token payload.");
    const requestType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (requestType !== payload.contentType.toLowerCase()) throw new Error("Upload content type mismatch.");
    const declaredLength = request.headers.get("content-length");
    if (declaredLength && Number(declaredLength) !== payload.contentLength) throw new Error("Upload content length mismatch.");
    if (!request.body) throw new Error("Upload body is required.");

    const path = this.objectPath(payload.key);
    const uploadId = randomUUID();
    const temporary = `${path}.upload-${uploadId}`;
    const temporaryMetadata = `${path}.meta-${uploadId}.json`;
    await mkdir(dirname(path), { recursive: true });
    const handle = await open(temporary, "wx");
    let written = 0;
    try {
      const reader = request.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        written += value.byteLength;
        if (written > payload.contentLength) throw new Error("Upload exceeds declared length.");
        await handle.write(value);
      }
      if (written !== payload.contentLength) throw new Error("Upload content length mismatch.");
      await handle.close();
      await writeFile(temporaryMetadata, JSON.stringify({ contentType: payload.contentType }), {
        encoding: "utf8",
        flag: "wx",
      });
      await rename(temporary, path);
      try {
        await rename(temporaryMetadata, `${path}.meta.json`);
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
    } catch (error) {
      await handle.close().catch(() => undefined);
      await Promise.all([
        rm(temporary, { force: true }),
        rm(temporaryMetadata, { force: true }),
      ]);
      throw error;
    }
  }

  async readFromToken(token: string): Promise<Response> {
    const payload = this.verify(token, "read");
    return this.objectResponse(payload.key, true);
  }

  async readPublic(encodedKey: string): Promise<Response> {
    return this.objectResponse(this.decodeKey(encodedKey), false);
  }

  private async objectResponse(key: string, isPrivate: boolean): Promise<Response> {
    const path = this.objectPath(key);
    let file: Awaited<ReturnType<typeof stat>>;
    try {
      file = await stat(path);
    } catch (error) {
      if (isFileNotFound(error)) throw new StorageObjectNotFoundError({ cause: error });
      throw error;
    }
    const metadata = await this.readMetadata(path);
    const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      headers: {
        "Content-Type": metadata.contentType,
        "Content-Length": String(file.size),
        "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  private objectPath(key: string): string {
    assertStorageKey(key);
    const target = resolve(this.root, key);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) throw new Error("Storage key escapes configured root.");
    return target;
  }

  private sign(payload: StorageTokenPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.secret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verify(token: string, operation: StorageTokenPayload["operation"]): StorageTokenPayload {
    const parts = token.split(".");
    if (parts.length !== 2) throw new Error("Invalid storage token.");
    const [encoded, signature] = parts;
    if (!encoded || !signature || !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]+$/.test(signature)) {
      throw new Error("Invalid storage token.");
    }
    const expected = createHmac("sha256", this.secret).update(encoded).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (supplied.toString("base64url") !== signature || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new Error("Invalid storage token.");
    }
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StorageTokenPayload;
    if (payload.operation !== operation || payload.expiresAt <= Date.now()) throw new Error("Expired or invalid storage token.");
    this.objectPath(payload.key);
    return payload;
  }

  private encodeKey(key: string): string {
    this.objectPath(key);
    return Buffer.from(key).toString("base64url");
  }

  private decodeKey(encoded: string): string {
    return Buffer.from(encoded, "base64url").toString("utf8");
  }

  private async readMetadata(path: string): Promise<{ contentType: string }> {
    try {
      const metadata = JSON.parse(await readFile(`${path}.meta.json`, "utf8")) as { contentType?: unknown };
      if (typeof metadata.contentType !== "string" || !metadata.contentType) throw new Error("Missing content type.");
      return { contentType: metadata.contentType };
    } catch (error) {
      throw new StorageProviderError("INVALID_METADATA", "Stored object metadata is missing or invalid.", { cause: error });
    }
  }
}

function assertReadObjectMaxBytes(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new StorageProviderError("INVALID_METADATA", "Read limit must be a positive safe integer.");
  }
}

function objectTooLargeError(): StorageProviderError {
  return new StorageProviderError("OBJECT_TOO_LARGE", "Stored object exceeds the requested read limit.");
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
