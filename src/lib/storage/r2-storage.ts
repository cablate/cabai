import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageObjectNotFoundError, StorageProviderError, type StorageProvider, type UploadTargetInput } from "./types";
import { assertStorageKey, assertUploadTargetInput, normalizeHttpOrigin, publicObjectUrl } from "./validation";

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

export class R2StorageProvider implements StorageProvider {
  readonly kind = "r2" as const;
  private readonly client: S3Client;

  private readonly publicOrigin: string;
  private readonly signUrl: typeof getSignedUrl;

  constructor(private readonly config: R2StorageConfig, dependencies?: { client?: S3Client; signUrl?: typeof getSignedUrl }) {
    for (const [name, value] of Object.entries(config)) {
      if (!value.trim()) throw new StorageProviderError("INVALID_CONFIG", `R2 ${name} is required.`);
    }
    this.publicOrigin = normalizeHttpOrigin(config.publicUrl, "R2 public URL", false);
    this.client = dependencies?.client ?? new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.signUrl = dependencies?.signUrl ?? getSignedUrl;
  }

  async createUploadTarget(input: UploadTargetInput): Promise<string> {
    assertUploadTargetInput(input);
    return this.signUrl(this.client, new PutObjectCommand({
      Bucket: this.config.bucketName,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }), { expiresIn: input.expiresIn });
  }

  async createDownloadTarget(key: string, expiresIn: number): Promise<string> {
    assertStorageKey(key);
    if (!Number.isSafeInteger(expiresIn) || expiresIn < 1) throw new StorageProviderError("INVALID_METADATA", "Download expiry must be a positive safe integer.");
    return this.signUrl(this.client, new GetObjectCommand({ Bucket: this.config.bucketName, Key: key }), { expiresIn });
  }

  publicUrl(key: string): string {
    return publicObjectUrl(this.publicOrigin, key);
  }

  async delete(key: string): Promise<void> {
    assertStorageKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucketName, Key: key }));
  }

  async head(key: string) {
    assertStorageKey(key);
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucketName, Key: key }));
      if (!Number.isSafeInteger(result.ContentLength) || result.ContentLength! < 0 || !result.ContentType) {
        throw new StorageProviderError("INVALID_METADATA", "Storage provider returned incomplete object metadata.");
      }
      return { contentLength: result.ContentLength!, contentType: result.ContentType };
    } catch (error) {
      if (isR2NotFound(error)) throw new StorageObjectNotFoundError({ cause: error });
      throw error;
    }
  }

  async readObject(key: string, maxBytes: number): Promise<Uint8Array> {
    assertStorageKey(key);
    assertReadObjectMaxBytes(maxBytes);
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucketName, Key: key }));
      const contentLength = result.ContentLength;
      const body = result.Body;
      if (
        typeof contentLength !== "number"
        || !Number.isSafeInteger(contentLength)
        || contentLength < 0
        || !body
        || typeof body.transformToByteArray !== "function"
      ) {
        throw new StorageProviderError("INVALID_METADATA", "Storage provider returned incomplete object data.");
      }
      if (contentLength > maxBytes) throw objectTooLargeError();
      const bytes = await body.transformToByteArray();
      if (bytes.byteLength > maxBytes) throw objectTooLargeError();
      return bytes;
    } catch (error) {
      if (isR2NotFound(error)) throw new StorageObjectNotFoundError({ cause: error });
      throw error;
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

function isR2NotFound(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = "$metadata" in error
    ? (error as Error & { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
    : undefined;
  return status === 404 || error.name === "NotFound" || error.name === "NoSuchKey";
}
