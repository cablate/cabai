import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserToken: vi.fn(),
  listUserTokenCourseSummaries: vi.fn(),
}));

vi.mock("@/lib/user-auth", () => ({
  requireUserToken: mocks.requireUserToken,
}));
vi.mock("@/lib/services/agent-content-service", () => ({
  listUserTokenCourseSummaries: mocks.listUserTokenCourseSummaries,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

import { GET } from "@/app/api/agent/user/v1/courses/route";

const userAuth = {
  userId: "user-1",
  tokenId: "token-99",
  scopes: ["course:read"],
};

const courseSummary = {
  id: "course-1",
  title: "Published course",
  description: "Course description",
  image: "https://example.com/course.png",
  updatedAt: new Date("2026-07-17T00:00:00.000Z"),
};

function request() {
  return new Request("https://example.com/api/agent/user/v1/courses");
}

describe("User Course Agent route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserToken.mockResolvedValue(userAuth);
    mocks.listUserTokenCourseSummaries.mockResolvedValue([courseSummary]);
  });

  it("requires the existing course:read user-token scope and uses the stable user id", async () => {
    const input = request();
    const response = await GET(input);

    expect(response.status).toBe(200);
    expect(mocks.requireUserToken).toHaveBeenCalledWith(input, "course:read");
    expect(mocks.listUserTokenCourseSummaries).toHaveBeenCalledWith("user-1");
  });

  it("returns only the compact course summary collection", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({
      data: [{
        id: "course-1",
        title: "Published course",
        description: "Course description",
        image: "https://example.com/course.png",
        updatedAt: "2026-07-17T00:00:00.000Z",
      }],
    });
    expect(Object.keys(body.data[0])).toEqual([
      "id",
      "title",
      "description",
      "image",
      "updatedAt",
    ]);
  });

  it("returns the thrown auth response without dispatching course lookup", async () => {
    mocks.requireUserToken.mockRejectedValueOnce(
      Response.json({ error: "Invalid, revoked, or expired token" }, { status: 401 }),
    );

    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid, revoked, or expired token",
    });
    expect(mocks.listUserTokenCourseSummaries).not.toHaveBeenCalled();
  });
});
