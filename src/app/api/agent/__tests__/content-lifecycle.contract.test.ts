import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAgent, archiveAgentCourse } = vi.hoisted(() => ({
  requireAgent: vi.fn(),
  archiveAgentCourse: vi.fn(),
}));

vi.mock("@/lib/agent-auth", () => ({ requireAgent }));
vi.mock("@/lib/services/agent-content-service", () => ({ archiveAgentCourse }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

import { POST } from "@/app/api/agent/courses/[id]/archive/route";

function request() {
  return new Request("https://example.com/api/agent/courses/course-1/archive", {
    method: "POST",
  });
}

function context() {
  return { params: Promise.resolve({ id: "course-1" }) };
}

describe("Agent content lifecycle contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAgent.mockResolvedValue({ agentId: "agent-key:key-1" });
  });

  it("preserves archive scope, success envelope, and service actor", async () => {
    archiveAgentCourse.mockResolvedValue("archived");

    const response = await POST(request(), context());

    expect(requireAgent).toHaveBeenCalledWith(expect.any(Request), "content:write");
    expect(archiveAgentCourse).toHaveBeenCalledWith("course-1", "agent-key:key-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { id: "course-1", status: "archived" },
    });
  });

  it.each([
    ["not-found", 404, "Course not found"],
    ["already-archived", 409, "Course is already archived"],
  ])("preserves archive rejection contract", async (result, status, error) => {
    archiveAgentCourse.mockResolvedValue(result);

    const response = await POST(request(), context());

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });
});
