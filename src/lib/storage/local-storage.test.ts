import type * as fsPromises from "node:fs/promises";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorageProvider } from "./local-storage";
import { StorageObjectNotFoundError } from "./types";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const SECRET = "a-test-secret-that-is-at-least-32-characters-long";

describe("LocalStorageProvider", () => {
  let root: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cabai-storage-"));
    provider = new LocalStorageProvider(root, SECRET, "http://localhost:3000");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function upload(key = "courses/example.txt", body = "hello", contentType = "text/plain") {
    const url = await provider.createUploadTarget({
      key,
      contentType,
      contentLength: Buffer.byteLength(body),
      expiresIn: 60,
    });
    const token = new URL(url).searchParams.get("token")!;
    await provider.storeUpload(token, new Request(url, {
      method: "PUT",
      headers: { "Content-Type": contentType, "Content-Length": String(Buffer.byteLength(body)) },
      body,
      duplex: "half",
    } as RequestInit));
  }

  it("stores, inspects, and reads a private object", async () => {
    await upload();
    await expect(provider.head("courses/example.txt")).resolves.toEqual({
      contentLength: 5,
      contentType: "text/plain",
    });

    const target = await provider.createDownloadTarget("courses/example.txt", 60);
    const response = await provider.readFromToken(new URL(target).searchParams.get("token")!);
    expect(await response.text()).toBe("hello");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects tampered and expired tokens", async () => {
    const target = await provider.createDownloadTarget("courses/example.txt", 60);
    const token = new URL(target).searchParams.get("token")!;
    await expect(provider.readFromToken(`${token.slice(0, -1)}x`)).rejects.toThrow("Invalid storage token");

    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const expired = await provider.createDownloadTarget("courses/example.txt", 1);
    clock.mockReturnValue(now + 1_000);
    await expect(provider.readFromToken(new URL(expired).searchParams.get("token")!)).rejects.toThrow(
      "Expired or invalid storage token",
    );
    clock.mockRestore();
  });

  it("rejects a non-canonical signature spelling that decodes to the signed bytes", async () => {
    const target = await provider.createDownloadTarget("courses/example.txt", 60);
    const token = new URL(target).searchParams.get("token")!;
    const [payload, signature] = token.split(".") as [string, string];
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const lastIndex = alphabet.indexOf(signature.at(-1)!);
    const alternate = alphabet[(lastIndex & ~3) + ((lastIndex + 1) & 3)]!;
    const nonCanonicalSignature = `${signature.slice(0, -1)}${alternate}`;

    expect(Buffer.from(nonCanonicalSignature, "base64url")).toEqual(Buffer.from(signature, "base64url"));
    await expect(provider.readFromToken(`${payload}.${nonCanonicalSignature}`)).rejects.toThrow("Invalid storage token");
  });

  it("rejects traversal, MIME mismatch, short bodies, and oversized bodies", async () => {
    await expect(provider.createUploadTarget({
      key: "../escape.txt", contentType: "text/plain", contentLength: 1, expiresIn: 60,
    })).rejects.toThrow("Invalid storage key");

    const target = await provider.createUploadTarget({
      key: "safe.txt", contentType: "text/plain", contentLength: 5, expiresIn: 60,
    });
    const token = new URL(target).searchParams.get("token")!;
    await expect(provider.storeUpload(token, new Request(target, {
      method: "PUT", headers: { "Content-Type": "image/png" }, body: "hello", duplex: "half",
    } as RequestInit))).rejects.toThrow("content type mismatch");
    await expect(provider.storeUpload(token, new Request(target, {
      method: "PUT", headers: { "Content-Type": "text/plain" }, body: "hey", duplex: "half",
    } as RequestInit))).rejects.toThrow("content length mismatch");
    await expect(provider.storeUpload(token, new Request(target, {
      method: "PUT", headers: { "Content-Type": "text/plain" }, body: "too long", duplex: "half",
    } as RequestInit))).rejects.toThrow("exceeds declared length");
  });

  it("supports public reads and removes both object and metadata", async () => {
    await upload();
    const encodedKey = provider.publicUrl("courses/example.txt").split("/").at(-1)!;
    const response = await provider.readPublic(encodedKey);
    expect(await response.text()).toBe("hello");
    expect(response.headers.get("cache-control")).toContain("immutable");

    await provider.delete("courses/example.txt");
    await expect(provider.head("courses/example.txt")).rejects.toThrow();
  });

  it("does not disguise missing object metadata as an empty object", async () => {
    await upload();
    await writeFile(join(root, "courses/example.txt.meta.json"), "{}", "utf8");
    await expect(provider.head("courses/example.txt")).rejects.toMatchObject({ code: "INVALID_METADATA" });
  });

  it("reads object bytes within the requested bound", async () => {
    await upload();
    const bytes = await provider.readObject("courses/example.txt", 5);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(bytes).toString("utf8")).toBe("hello");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid read bound %s",
    async (maxBytes) => {
      await expect(provider.readObject("courses/example.txt", maxBytes)).rejects.toMatchObject({
        code: "INVALID_METADATA",
      });
    },
  );

  it("rejects an oversized object from stat before reading it", async () => {
    await upload();
    const readFileMock = vi.mocked(readFile);
    readFileMock.mockClear();

    await expect(provider.readObject("courses/example.txt", 4)).rejects.toMatchObject({
      code: "OBJECT_TOO_LARGE",
    });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("enforces the bound again after reading the object", async () => {
    await upload();
    vi.mocked(readFile).mockResolvedValueOnce(Buffer.from("hello!"));

    await expect(provider.readObject("courses/example.txt", 5)).rejects.toMatchObject({
      code: "OBJECT_TOO_LARGE",
    });
  });

  it("maps a missing object to the common not-found error", async () => {
    await expect(provider.readObject("courses/missing.txt", 5)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });
});
