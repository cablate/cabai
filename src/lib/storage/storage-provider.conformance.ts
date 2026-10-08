import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StorageObjectNotFoundError, type StorageProvider, type UploadTargetInput } from "./types";

export interface StorageConformanceHarness {
  provider: StorageProvider;
  upload(input: UploadTargetInput, body: string): Promise<void>;
  readPrivate(key: string): Promise<string>;
  dispose?(): Promise<void>;
}

export function storageProviderConformance(
  name: string,
  createHarness: () => Promise<StorageConformanceHarness>,
): void {
  describe(`${name} storage provider conformance`, () => {
    let harness: StorageConformanceHarness;

    beforeEach(async () => {
      harness = await createHarness();
    });

    afterEach(async () => {
      await harness.dispose?.();
    });

    it("uploads, reads privately, and returns complete metadata", async () => {
      const input = {
        key: "courses/conformance/example.txt",
        contentType: "text/plain",
        contentLength: 5,
        expiresIn: 60,
      };
      await harness.upload(input, "hello");

      await expect(harness.provider.head(input.key)).resolves.toEqual({
        contentLength: 5,
        contentType: "text/plain",
      });
      await expect(harness.provider.readObject(input.key, 5)).resolves.toEqual(new TextEncoder().encode("hello"));
      await expect(harness.readPrivate(input.key)).resolves.toBe("hello");
      expect(new URL(harness.provider.publicUrl(input.key)).protocol).toMatch(/^https?:$/);
    });

    it("enforces the signed upload's declared length", async () => {
      await expect(harness.upload({
        key: "courses/conformance/length.txt",
        contentType: "text/plain",
        contentLength: 4,
        expiresIn: 60,
      }, "hello")).rejects.toThrow(/length|declared/i);
    });

    it("uses an idempotent delete and a common not-found error", async () => {
      const key = "courses/conformance/deleted.txt";
      await harness.upload({ key, contentType: "text/plain", contentLength: 5, expiresIn: 60 }, "hello");
      await harness.provider.delete(key);
      await expect(harness.provider.delete(key)).resolves.toBeUndefined();
      await expect(harness.provider.head(key)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
      await expect(harness.provider.readObject(key, 5)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
      await expect(harness.readPrivate(key)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
      "rejects invalid read bound %s",
      async (maxBytes) => {
        await expect(harness.provider.readObject("courses/conformance/example.txt", maxBytes)).rejects.toMatchObject({
          code: "INVALID_METADATA",
        });
      },
    );

    it.each(["", "/absolute.txt", "../escape.txt", "safe/../escape.txt", "safe\\escape.txt", "safe//escape.txt", "safe\0escape.txt"])(
      "rejects unsafe key %j at every provider entry point",
      async (key) => {
        const upload = { key, contentType: "text/plain", contentLength: 1, expiresIn: 60 };
        await expect(harness.provider.createUploadTarget(upload)).rejects.toMatchObject({ code: "INVALID_KEY" });
        await expect(harness.provider.createDownloadTarget(key, 60)).rejects.toMatchObject({ code: "INVALID_KEY" });
        expect(() => harness.provider.publicUrl(key)).toThrow(expect.objectContaining({ code: "INVALID_KEY" }));
        await expect(harness.provider.delete(key)).rejects.toMatchObject({ code: "INVALID_KEY" });
        await expect(harness.provider.head(key)).rejects.toMatchObject({ code: "INVALID_KEY" });
        await expect(harness.provider.readObject(key, 1)).rejects.toMatchObject({ code: "INVALID_KEY" });
      },
    );
  });
}
