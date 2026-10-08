import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createUploadTarget: vi.fn(),
  createDownloadTarget: vi.fn(),
  publicUrl: vi.fn(),
  deleteObject: vi.fn(),
  head: vi.fn(),
  readObject: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/storage", () => ({
  getStorageProvider: () => ({
    kind: "r2",
    createUploadTarget: mocks.createUploadTarget,
    createDownloadTarget: mocks.createDownloadTarget,
    publicUrl: mocks.publicUrl,
    delete: mocks.deleteObject,
    head: mocks.head,
    readObject: mocks.readObject,
  }),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST as createUpload } from "@/app/api/upload/route";
import { POST as confirmUpload } from "@/app/api/upload/confirm/route";
import { db } from "@/lib/db";
import { media, rateLimitWindows, users } from "@/lib/db/schema";
import { createTestUser } from "@/test/helpers";

let userIds: string[] = [];
let activeUserId = "";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockImplementation(async () => ({ user: { id: activeUserId } }));
  mocks.createUploadTarget.mockResolvedValue("https://storage.example/upload");
  mocks.createDownloadTarget.mockResolvedValue("https://storage.example/download");
  mocks.publicUrl.mockImplementation((key: string) => `https://cdn.example/${key}`);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.head.mockResolvedValue({ contentLength: 1234, contentType: "image/png" });
  mocks.readObject.mockResolvedValue(new Uint8Array());
  userIds = [];
  activeUserId = "";
});

afterEach(async () => {
  if (userIds.length === 0) return;
  await db.delete(media).where(inArray(media.uploadedBy, userIds));
  await db.delete(rateLimitWindows).where(inArray(
    rateLimitWindows.key,
    userIds.map((id) => `upload:admin:${id}`),
  ));
  await db.delete(users).where(inArray(users.id, userIds));
});

async function createAdmin(): Promise<string> {
  const user = await createTestUser({ role: "admin" });
  userIds.push(user.id);
  activeUserId = user.id;
  return user.id;
}

function uploadRequest(body: unknown, path = "/api/upload"): Request {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.test" },
    body: JSON.stringify(body),
  });
}

async function insertPendingMedia(uploadedBy: string): Promise<{ id: string; storageKey: string }> {
  const id = randomUUID();
  const storageKey = `uploads/plan-cover/${uploadedBy}/${randomUUID()}-cover.png`;
  await db.insert(media).values({
    id,
    storageKey,
    publicUrl: `https://cdn.example/${storageKey}`,
    filename: "cover.png",
    mimeType: "image/png",
    fileSize: 1234,
    context: "plan-cover",
    uploadedBy,
    status: "pending",
  });
  return { id, storageKey };
}

describe("upload mutation failure invariants", () => {
  it("completes upload target creation, confirmation, and durable read-back", async () => {
    const uploaderId = await createAdmin();
    const createResponse = await createUpload(uploadRequest({
      filename: "cover.png",
      contentType: "image/png",
      fileSize: 1234,
      context: "plan-cover",
    }));
    expect(createResponse.status).toBe(200);
    const created = await createResponse.json() as { mediaId: string; storageKey: string; signedUrl: string };
    expect(created.signedUrl).toBe("https://storage.example/upload");

    const confirmResponse = await confirmUpload(uploadRequest({ storageKey: created.storageKey }, "/api/upload/confirm"));
    expect(confirmResponse.status).toBe(200);
    await expect(confirmResponse.json()).resolves.toMatchObject({ success: true, mediaId: created.mediaId });
    await expect(db.query.media.findFirst({ where: eq(media.id, created.mediaId) })).resolves.toMatchObject({
      uploadedBy: uploaderId,
      storageKey: created.storageKey,
      status: "confirmed",
      confirmedAt: expect.any(Date),
    });
  }, 30_000);

  it("does not persist a pending media row when storage target creation fails", async () => {
    const uploaderId = await createAdmin();
    mocks.createUploadTarget.mockRejectedValueOnce(new Error("storage unavailable"));

    const response = await createUpload(uploadRequest({
      filename: "cover.png",
      contentType: "image/png",
      fileSize: 1234,
      context: "plan-cover",
    }));

    expect(response.status).toBe(500);
    expect(mocks.createUploadTarget).toHaveBeenCalledOnce();
    await expect(db.query.media.findMany({ where: eq(media.uploadedBy, uploaderId) }))
      .resolves.toHaveLength(0);
  }, 30_000);

  it("rejects active SVG content before creating a storage target or pending row", async () => {
    const uploaderId = await createAdmin();

    const response = await createUpload(uploadRequest({
      filename: "cover.svg",
      contentType: "image/svg+xml",
      fileSize: 1234,
      context: "plan-cover",
    }));

    expect(response.status).toBe(400);
    expect(mocks.createUploadTarget).not.toHaveBeenCalled();
    await expect(db.query.media.findMany({ where: eq(media.uploadedBy, uploaderId) }))
      .resolves.toHaveLength(0);
  }, 30_000);

  it("returns retry metadata and creates no target or media row when the shared upload quota is exhausted", async () => {
    const uploaderId = await createAdmin();
    const now = new Date();
    await db.insert(rateLimitWindows).values({
      key: `upload:admin:${uploaderId}`,
      windowStartedAt: new Date(Math.floor(now.getTime() / 60_000) * 60_000),
      count: 10,
      updatedAt: now,
    });

    const response = await createUpload(uploadRequest({
      filename: "cover.png",
      contentType: "image/png",
      fileSize: 1234,
      context: "plan-cover",
    }));

    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(response.headers.get("X-RateLimit-Reset")).not.toBeNull();
    expect(mocks.createUploadTarget).not.toHaveBeenCalled();
    await expect(db.query.media.findMany({ where: eq(media.uploadedBy, uploaderId) }))
      .resolves.toHaveLength(0);
  }, 30_000);

  it("does not confirm a pending upload when its object is missing", async () => {
    const uploaderId = await createAdmin();
    const fixture = await insertPendingMedia(uploaderId);
    mocks.head.mockRejectedValueOnce(new Error("object missing"));

    const response = await confirmUpload(uploadRequest({ storageKey: fixture.storageKey }, "/api/upload/confirm"));

    expect(response.status).toBe(404);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    await expect(db.query.media.findFirst({ where: eq(media.id, fixture.id) }))
      .resolves.toMatchObject({ status: "pending", confirmedAt: null });
  }, 30_000);

  it("deletes and marks a pending upload when stored metadata does not match", async () => {
    const uploaderId = await createAdmin();
    const fixture = await insertPendingMedia(uploaderId);
    mocks.head.mockResolvedValueOnce({ contentLength: 2048, contentType: "text/html" });

    const response = await confirmUpload(uploadRequest({ storageKey: fixture.storageKey }, "/api/upload/confirm"));

    expect(response.status).toBe(400);
    expect(mocks.deleteObject).toHaveBeenCalledWith(fixture.storageKey);
    await expect(db.query.media.findFirst({ where: eq(media.id, fixture.id) }))
      .resolves.toMatchObject({ status: "deleted", confirmedAt: null });
  }, 30_000);

  it("does not let a different admin confirm another uploader's pending row", async () => {
    const ownerId = await createAdmin();
    const fixture = await insertPendingMedia(ownerId);
    const otherAdminId = await createAdmin();

    const response = await confirmUpload(uploadRequest({ storageKey: fixture.storageKey }, "/api/upload/confirm"));

    expect(response.status).toBe(404);
    expect(mocks.head).not.toHaveBeenCalled();
    await expect(db.query.media.findFirst({ where: eq(media.id, fixture.id) }))
      .resolves.toMatchObject({ uploadedBy: ownerId, status: "pending" });
    expect(activeUserId).toBe(otherAdminId);
  }, 30_000);
});
