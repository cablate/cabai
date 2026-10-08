import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type * as drizzleOrm from "drizzle-orm";
import { media } from "@/lib/db/schema";
import { LocalStorageProvider } from "@/lib/storage/local-storage";

const mocks = vi.hoisted(() => ({ findMedia: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { media: { findFirst: mocks.findMedia } } } }));
vi.mock("@/lib/storage", () => ({ requireLocalStorageProvider: mocks.provider }));
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...await importOriginal<typeof drizzleOrm>(), eq: vi.fn(),
}));
import { GET } from "./route";

const key = "lesson-content/member/private.txt";
const encode = (value: string) => Buffer.from(value).toString("base64url");
const context = (value = encode(key)) => ({ params: Promise.resolve({ key: value }) });
const request = () => new Request("http://localhost:3000/api/storage/local/public/fixture");

async function expectNotFound(response: Response) {
  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({ error: "Asset not found" });
  expect(response.headers.get("cache-control") ?? "").not.toContain("public");
}

describe("local public asset authorization", () => {
  let root: string;
  let provider: LocalStorageProvider;
  beforeEach(async () => {
    vi.clearAllMocks();
    root = await mkdtemp(join(tmpdir(), "cabai-public-access-"));
    provider = new LocalStorageProvider(root, "synthetic-signing-secret-at-least-32-characters", "http://localhost:3000");
    mocks.provider.mockReturnValue(provider);
    mocks.findMedia.mockResolvedValue({ storageKey: key, context: "plan-cover", status: "confirmed" });
    const body = "synthetic asset";
    const url = await provider.createUploadTarget({ key, contentType: "text/plain", contentLength: Buffer.byteLength(body), expiresIn: 60 });
    await provider.storeUpload(new URL(url).searchParams.get("token")!, new Request(url, {
      method: "PUT", headers: { "Content-Type": "text/plain", "Content-Length": String(Buffer.byteLength(body)) },
      body, duplex: "half",
    } as RequestInit));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}cabai-public-access-`)) throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  });

  it.each(["pending", "confirmed"])("preserves public image %s reads", async (status) => {
    mocks.findMedia.mockResolvedValue({ storageKey: key, context: "plan-cover", status });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("synthetic asset");
    expect(eq).toHaveBeenCalledWith(media.storageKey, key);
    expect(response.headers.get("cache-control")).toContain("public");
  });
  it.each(["lesson-content", "service-guide", "skill-artifact", "unknown-context"])("rejects %s regardless of object key", async (assetContext) => {
    mocks.findMedia.mockResolvedValue({ storageKey: key, context: assetContext, status: "confirmed" });
    await expectNotFound(await GET(request(), context()));
  });
  it.each(["orphaned", "deleted", "unknown-status"])("rejects %s public records", async (status) => {
    mocks.findMedia.mockResolvedValue({ storageKey: key, context: "plan-cover", status });
    await expectNotFound(await GET(request(), context()));
  });
  it("rejects unregistered legacy objects rather than assuming public", async () => {
    mocks.findMedia.mockResolvedValue(undefined);
    await expectNotFound(await GET(request(), context()));
  });
  it.each(["", "%%invalid", `${encode(key)}=`, encode("../escape"), encode("/absolute")])("rejects invalid key encoding/path %s before querying", async (encoded) => {
    await expectNotFound(await GET(request(), context(encoded)));
    expect(mocks.findMedia).not.toHaveBeenCalled();
  });
  it("fails closed on database errors", async () => {
    mocks.findMedia.mockRejectedValue(new Error("database unavailable"));
    await expectNotFound(await GET(request(), context()));
  });
  it("does not let an expired private URL become a public capability", async () => {
    mocks.findMedia.mockResolvedValue({ storageKey: key, context: "lesson-content", status: "confirmed" });
    const now = Date.now();
    const signed = await provider.createDownloadTarget(key, 1);
    const token = new URL(signed).searchParams.get("token")!;
    const payload = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8")) as { key: string };
    vi.spyOn(Date, "now").mockReturnValue(now + 2000);
    await expect(provider.readFromToken(token)).rejects.toThrow("Expired");
    await expectNotFound(await GET(request(), context(encode(payload.key))));
  });
  it("keeps valid signed private downloads working", async () => {
    const token = new URL(await provider.createDownloadTarget(key, 60)).searchParams.get("token")!;
    const response = await provider.readFromToken(token);
    expect(await response.text()).toBe("synthetic asset");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
