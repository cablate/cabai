export interface StoredObjectMetadata {
  contentLength: number;
  contentType: string;
}

export interface UploadTargetInput {
  key: string;
  contentType: string;
  contentLength: number;
  expiresIn: number;
}

export type StorageProviderErrorCode =
  | "INVALID_CONFIG"
  | "INVALID_KEY"
  | "INVALID_METADATA"
  | "NOT_FOUND"
  | "OBJECT_TOO_LARGE";

export class StorageProviderError extends Error {
  constructor(
    public readonly code: StorageProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StorageProviderError";
  }
}

export class StorageObjectNotFoundError extends StorageProviderError {
  constructor(options?: ErrorOptions) {
    super("NOT_FOUND", "Stored object was not found.", options);
    this.name = "StorageObjectNotFoundError";
  }
}

export interface StorageProvider {
  readonly kind: "local" | "r2";
  createUploadTarget(input: UploadTargetInput): Promise<string>;
  createDownloadTarget(key: string, expiresIn: number): Promise<string>;
  publicUrl(key: string): string;
  delete(key: string): Promise<void>;
  head(key: string): Promise<StoredObjectMetadata>;
  readObject(key: string, maxBytes: number): Promise<Uint8Array>;
}
