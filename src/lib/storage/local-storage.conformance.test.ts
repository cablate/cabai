import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorageProvider } from "./local-storage";
import { storageProviderConformance } from "./storage-provider.conformance";

const SECRET = "a-test-secret-that-is-at-least-32-characters-long";

storageProviderConformance("local", async () => {
  const root = await mkdtemp(join(tmpdir(), "cabai-storage-conformance-"));
  const provider = new LocalStorageProvider(root, SECRET, "http://localhost:3000");
  return {
    provider,
    async upload(input, body) {
      const target = await provider.createUploadTarget(input);
      const token = new URL(target).searchParams.get("token")!;
      await provider.storeUpload(token, new Request(target, {
        method: "PUT",
        headers: { "Content-Type": input.contentType, "Content-Length": String(Buffer.byteLength(body)) },
        body,
        duplex: "half",
      } as RequestInit));
    },
    async readPrivate(key) {
      const target = await provider.createDownloadTarget(key, 60);
      const response = await provider.readFromToken(new URL(target).searchParams.get("token")!);
      return response.text();
    },
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
});
