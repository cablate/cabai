import { StorageProviderError, type UploadTargetInput } from "./types";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function assertStorageKey(key: string): void {
  if (
    !key
    || key.startsWith("/")
    || key.endsWith("/")
    || key.includes("\\")
    || key.includes("//")
    || CONTROL_CHARACTERS.test(key)
    || key.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new StorageProviderError("INVALID_KEY", "Invalid storage key.");
  }
}

export function assertUploadTargetInput(input: UploadTargetInput): void {
  assertStorageKey(input.key);
  if (!input.contentType.trim()) {
    throw new StorageProviderError("INVALID_METADATA", "Upload content type is required.");
  }
  if (!Number.isSafeInteger(input.contentLength) || input.contentLength < 1) {
    throw new StorageProviderError("INVALID_METADATA", "Upload content length must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(input.expiresIn) || input.expiresIn < 1) {
    throw new StorageProviderError("INVALID_METADATA", "Upload expiry must be a positive safe integer.");
  }
}

export function normalizeHttpOrigin(value: string, label: string, allowHttp: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new StorageProviderError("INVALID_CONFIG", `${label} must be a valid URL origin.`, { cause: error });
  }

  const acceptedProtocols = allowHttp ? ["http:", "https:"] : ["https:"];
  if (
    !acceptedProtocols.includes(url.protocol)
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new StorageProviderError("INVALID_CONFIG", `${label} must be a valid URL origin.`);
  }
  return url.origin;
}

export function publicObjectUrl(origin: string, key: string): string {
  assertStorageKey(key);
  return `${origin}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
