import "server-only";
import { getAppBaseUrl } from "@/lib/app-url";
import { inspectPlatformConfig } from "@/lib/config/platform";
import { LocalStorageProvider } from "./local-storage";
import { R2StorageProvider } from "./r2-storage";
import type { StorageProvider } from "./types";

let provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (provider) return provider;
  const inspection = inspectPlatformConfig();
  const storage = inspection.capabilities.storage;
  if (storage.state !== "enabled") throw new Error(`Storage provider is ${storage.state}: ${storage.missing.join(", ")}`);

  provider = inspection.values.storageProvider === "local"
    ? new LocalStorageProvider(inspection.values.localStoragePath, process.env.AUTH_SECRET ?? "", getAppBaseUrl())
    : new R2StorageProvider({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? "",
      bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "",
      publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "",
    });
  return provider;
}

export function requireLocalStorageProvider(): LocalStorageProvider {
  const current = getStorageProvider();
  if (!(current instanceof LocalStorageProvider)) throw new Error("Local storage is not enabled.");
  return current;
}

export {
  StorageObjectNotFoundError,
  StorageProviderError,
  type StorageProvider,
  type StoredObjectMetadata,
  type UploadTargetInput,
} from "./types";
