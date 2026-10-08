import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findMedia: vi.fn(),
  findUser: vi.fn(),
  findLesson: vi.fn(),
  findCourse: vi.fn(),
  checkCourseAccess: vi.fn(),
  checkPlanAccess: vi.fn(),
  generateDownloadSignedUrl: vi.fn(),
  isPrivateMediaContext: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      media: { findFirst: mocks.findMedia },
      users: { findFirst: mocks.findUser },
      lessons: { findFirst: mocks.findLesson },
      courses: { findFirst: mocks.findCourse },
      planContents: { findFirst: vi.fn() },
    },
  },
}));
vi.mock("@/lib/storage", () => ({
  getStorageProvider: () => ({ createDownloadTarget: mocks.generateDownloadSignedUrl }),
}));
vi.mock("@/lib/course-access", () => ({ checkCourseAccess: mocks.checkCourseAccess }));
vi.mock("@/lib/access", () => ({ checkPlanAccess: mocks.checkPlanAccess }));
vi.mock("@/lib/media-assets", () => ({
  isPrivateMediaContext: mocks.isPrivateMediaContext,
}));

import { GET } from "./route";

const privateRecord = {
  id: "media-private",
  status: "confirmed",
  context: "lesson-content",
  publicUrl: "/api/assets/media-private",
  storageKey: "private/file.pdf",
  uploadedBy: "uploader-1",
  entityType: "lesson",
  entityId: "lesson-1",
};

function request(headers?: HeadersInit) {
  return new Request("https://cabai.test/api/assets/media-private", { headers });
}

function context(id = "media-private") {
  return { params: Promise.resolve({ id }) };
}

describe("private asset access contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMedia.mockResolvedValue(privateRecord);
    mocks.isPrivateMediaContext.mockReturnValue(true);
    mocks.generateDownloadSignedUrl.mockResolvedValue("https://signed.test/file.pdf");
    mocks.findUser.mockResolvedValue({ role: "member", email: "member@example.com" });
    mocks.findLesson.mockResolvedValue({
      id: "lesson-1",
      courseId: "course-1",
      isPreview: false,
      status: "published",
    });
    mocks.findCourse.mockResolvedValue({ status: "published" });
  });

  it.each([
    ["missing", null],
    ["deleted", { ...privateRecord, status: "deleted" }],
    ["orphaned", { ...privateRecord, status: "orphaned" }],
  ])("returns 404 when the asset is %s", async (_state, record) => {
    mocks.findMedia.mockResolvedValue(record);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Asset not found" });
  });

  it("does not reveal a private asset to an anonymous caller", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Asset not found" });
  });

  it("does not treat an Agent Bearer key as member access", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET(
      request({ Authorization: "Bearer cab_agent_example" }),
      context(),
    );

    expect(response.status).toBe(404);
    expect(mocks.generateDownloadSignedUrl).not.toHaveBeenCalled();
  });

  it("does not reveal a private asset to a member without entitlement", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "member-1", email: "member@example.com" } });
    mocks.checkCourseAccess.mockResolvedValue({ hasAccess: false });

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Asset not found" });
  });

  it("redirects an entitled member to a private no-store signed URL", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "member-1", email: "member@example.com" } });
    mocks.checkCourseAccess.mockResolvedValue({ hasAccess: true });

    const response = await GET(request(), context());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://signed.test/file.pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["draft", "archived"])("denies %s lessons even with entitlement", async (status) => {
    mocks.auth.mockResolvedValue({ user: { id: "member-1" } });
    mocks.checkCourseAccess.mockResolvedValue({ hasAccess: true });
    mocks.findLesson.mockResolvedValue({ id: "lesson-1", courseId: "course-1", isPreview: false, status });
    expect((await GET(request(), context())).status).toBe(404);
    expect(mocks.generateDownloadSignedUrl).not.toHaveBeenCalled();
    expect(mocks.checkCourseAccess).not.toHaveBeenCalled();
  });

  it.each(["draft", "archived", null])("denies preview assets when course is %s", async (status) => {
    mocks.auth.mockResolvedValue({ user: { id: "member-1" } });
    mocks.findLesson.mockResolvedValue({ id: "lesson-1", courseId: "course-1", isPreview: true, status: "published" });
    mocks.findCourse.mockResolvedValue(status ? { status } : null);
    expect((await GET(request(), context())).status).toBe(404);
    expect(mocks.generateDownloadSignedUrl).not.toHaveBeenCalled();
  });

  it("allows signed-in preview only inside a published course without entitlement", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "member-1" } });
    mocks.findLesson.mockResolvedValue({ id: "lesson-1", courseId: "course-1", isPreview: true, status: "published" });
    mocks.checkCourseAccess.mockResolvedValue({ hasAccess: false });
    expect((await GET(request(), context())).status).toBe(307);
    expect(mocks.checkCourseAccess).not.toHaveBeenCalled();
  });

  it("preserves database-admin access to unpublished assets", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.findUser.mockResolvedValue({ role: "admin" });
    mocks.findLesson.mockResolvedValue({ status: "draft" });
    mocks.findCourse.mockResolvedValue({ status: "draft" });
    expect((await GET(request(), context())).status).toBe(307);
    expect(mocks.findLesson).not.toHaveBeenCalled();
  });

  it("does not trust an admin role carried only in the session", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "member-1", role: "admin" } });
    mocks.findLesson.mockResolvedValue({ status: "draft" });
    expect((await GET(request(), context())).status).toBe(404);
    expect(mocks.generateDownloadSignedUrl).not.toHaveBeenCalled();
  });

  it("keeps public media anonymously accessible", async () => {
    mocks.isPrivateMediaContext.mockReturnValue(false);
    mocks.findMedia.mockResolvedValue({
      ...privateRecord,
      context: "plan-cover",
      publicUrl: "https://assets.test/cover.png",
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://assets.test/cover.png");
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
