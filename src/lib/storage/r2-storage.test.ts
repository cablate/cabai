import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type HeadObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { describe, expect, it, vi } from "vitest";
import { R2StorageProvider } from "./r2-storage";
import { StorageObjectNotFoundError } from "./types";
import { storageProviderConformance } from "./storage-provider.conformance";

interface ObjectRecord { body: string; contentType: string }

const VALID_CONFIG = {
  accountId: "test-account",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  bucketName: "test-bucket",
  publicUrl: "https://assets.example.test",
};

class FakeR2Client {
  readonly objects = new Map<string, ObjectRecord>();

  async send(command: HeadObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown> {
    const key = command.input.Key!;
    if (command instanceof DeleteObjectCommand) {
      this.objects.delete(key);
      return {};
    }
    const object = this.objects.get(key);
    if (!object) {
      const error = new Error("missing");
      error.name = "NoSuchKey";
      throw error;
    }
    if (command instanceof GetObjectCommand) {
      return {
        ContentLength: Buffer.byteLength(object.body),
        Body: {
          transformToByteArray: async () => new TextEncoder().encode(object.body),
        },
      };
    }
    return { ContentLength: Buffer.byteLength(object.body), ContentType: object.contentType };
  }
}

storageProviderConformance("R2", async () => {
  const client = new FakeR2Client();
  let signedCommand: PutObjectCommand | GetObjectCommand | undefined;
  const signUrl = (async (_client, command) => {
    const storageCommand = command as unknown as PutObjectCommand | GetObjectCommand;
    signedCommand = storageCommand;
    return `https://signed.example.test/${encodeURIComponent(storageCommand.input.Key!)}`;
  }) as typeof getSignedUrl;
  const provider = new R2StorageProvider(VALID_CONFIG, { client: client as unknown as S3Client, signUrl });

  return {
    provider,
    async upload(input, body) {
      await provider.createUploadTarget(input);
      expect(signedCommand).toBeInstanceOf(PutObjectCommand);
      const signed = (signedCommand as PutObjectCommand).input;
      if (Buffer.byteLength(body) !== signed.ContentLength) throw new Error("Upload content length differs from declared length.");
      client.objects.set(signed.Key!, { body, contentType: signed.ContentType! });
    },
    async readPrivate(key) {
      await provider.createDownloadTarget(key, 60);
      expect(signedCommand).toBeInstanceOf(GetObjectCommand);
      const object = client.objects.get((signedCommand as GetObjectCommand).input.Key!);
      if (!object) throw new StorageObjectNotFoundError();
      return object.body;
    },
  };
});

function providerWithResponse(response: unknown): { provider: R2StorageProvider; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn().mockResolvedValue(response);
  const provider = new R2StorageProvider(VALID_CONFIG, { client: { send } as unknown as S3Client });
  return { provider, send };
}

describe("R2StorageProvider bounded reads", () => {
  it("returns object body bytes", async () => {
    const expected = new TextEncoder().encode("hello");
    const transformToByteArray = vi.fn().mockResolvedValue(expected);
    const { provider } = providerWithResponse({ ContentLength: 5, Body: { transformToByteArray } });

    await expect(provider.readObject("courses/example.txt", 5)).resolves.toEqual(expected);
    expect(transformToByteArray).toHaveBeenCalledOnce();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid read bound %s without sending a request",
    async (maxBytes) => {
      const { provider, send } = providerWithResponse({});
      await expect(provider.readObject("courses/example.txt", maxBytes)).rejects.toMatchObject({
        code: "INVALID_METADATA",
      });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("rejects oversized ContentLength before converting the body", async () => {
    const transformToByteArray = vi.fn().mockResolvedValue(new Uint8Array(6));
    const { provider } = providerWithResponse({ ContentLength: 6, Body: { transformToByteArray } });

    await expect(provider.readObject("courses/example.txt", 5)).rejects.toMatchObject({
      code: "OBJECT_TOO_LARGE",
    });
    expect(transformToByteArray).not.toHaveBeenCalled();
  });

  it("enforces the bound again after converting the body", async () => {
    const transformToByteArray = vi.fn().mockResolvedValue(new Uint8Array(6));
    const { provider } = providerWithResponse({ ContentLength: 5, Body: { transformToByteArray } });

    await expect(provider.readObject("courses/example.txt", 5)).rejects.toMatchObject({
      code: "OBJECT_TOO_LARGE",
    });
    expect(transformToByteArray).toHaveBeenCalledOnce();
  });

  it("maps a missing object to the common not-found error", async () => {
    const error = new Error("missing");
    error.name = "NoSuchKey";
    const send = vi.fn().mockRejectedValue(error);
    const provider = new R2StorageProvider(VALID_CONFIG, { client: { send } as unknown as S3Client });

    await expect(provider.readObject("courses/missing.txt", 5)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  it.each([
    ["missing ContentLength", { Body: { transformToByteArray: async () => new Uint8Array(0) } }],
    ["negative ContentLength", { ContentLength: -1, Body: { transformToByteArray: async () => new Uint8Array(0) } }],
    ["fractional ContentLength", { ContentLength: 1.5, Body: { transformToByteArray: async () => new Uint8Array(0) } }],
    ["missing Body", { ContentLength: 1 }],
    ["non-convertible Body", { ContentLength: 1, Body: {} }],
  ])("rejects incomplete object data: %s", async (_label, response) => {
    const { provider } = providerWithResponse(response);
    await expect(provider.readObject("courses/example.txt", 5)).rejects.toMatchObject({
      code: "INVALID_METADATA",
    });
  });
});

describe("R2StorageProvider configuration", () => {
  it.each([
    "http://assets.example.test",
    "https://user:pass@assets.example.test",
    "https://assets.example.test/prefix",
    "https://assets.example.test?token=secret",
  ])("rejects an unsafe public URL boundary: %s", (publicUrl) => {
    expect(() => new R2StorageProvider({ ...VALID_CONFIG, publicUrl })).toThrow(expect.objectContaining({ code: "INVALID_CONFIG" }));
  });

  it("URL-encodes safe key segments without changing the object hierarchy", () => {
    const provider = new R2StorageProvider(VALID_CONFIG);
    expect(provider.publicUrl("courses/課程 cover.png")).toBe(
      "https://assets.example.test/courses/%E8%AA%B2%E7%A8%8B%20cover.png",
    );
  });
});
