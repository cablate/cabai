import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAgent = vi.fn();
const requireDestructiveConfirmation = vi.fn();
const validateCourseReadiness = vi.fn();
const publishCourseInformationBundle = vi.fn();

vi.mock("@/lib/agent-auth", () => ({ requireAgent, requireDestructiveConfirmation }));
vi.mock("@/lib/course-validation", () => ({ validateCourseReadiness }));
vi.mock("@/lib/services/publication-bundle-service", () => ({ publishCourseInformationBundle }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));

const { POST: readiness } = await import("@/app/api/agent/readiness/route");
const { POST: publish } = await import("@/app/api/agent/publish/route");

function jsonRequest(path: string, body: unknown, headers?: HeadersInit) {
  return new Request(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("Agent content route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAgent.mockResolvedValue({ agentId: "agent-1" });
    validateCourseReadiness.mockResolvedValue({ ready: true });
    publishCourseInformationBundle.mockResolvedValue({ ok: true, value: { course: { id: "course-1" }, information: { id: "info-1" } } });
    requireDestructiveConfirmation.mockImplementation((request: Request) => {
      if (request.headers.get("x-confirm-destructive") !== "true") {
        throw Response.json({ error: "Confirmation required" }, { status: 428 });
      }
    });
  });

  it("keeps readiness success and validation envelopes stable", async () => {
    const success = await readiness(jsonRequest("/api/agent/readiness", { courseId: "course-1" }));
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toEqual({ data: { ready: true } });

    const invalid = await readiness(jsonRequest("/api/agent/readiness", {}));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "courseId is required" });
    expect(validateCourseReadiness).toHaveBeenCalledOnce();
  });

  it("passes authentication responses through and does not call the service", async () => {
    requireAgent.mockRejectedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));
    const response = await readiness(jsonRequest("/api/agent/readiness", { courseId: "course-1" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(validateCourseReadiness).not.toHaveBeenCalled();
  });

  it("keeps publish confirmation and success contracts stable", async () => {
    const input = {
      courseId: "course-1",
      sourceVersion: "course-fingerprint",
      informationId: "info-1",
      expectedInformationRevision: 2,
      idempotencyKey: "publish-course-1-info-1",
    };
    const missingConfirmation = await publish(jsonRequest("/api/agent/publish", input));
    expect(missingConfirmation.status).toBe(428);
    expect(publishCourseInformationBundle).not.toHaveBeenCalled();

    const success = await publish(
      jsonRequest("/api/agent/publish", input, { "x-confirm-destructive": "true" }),
    );
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toEqual({ data: { course: { id: "course-1" }, information: { id: "info-1" } } });
    expect(publishCourseInformationBundle).toHaveBeenCalledWith({
      ...input,
      actor: { type: "agent", id: "agent-1" },
    });
  });

  it("rejects incomplete Course bundle payloads before any publish side effect", async () => {
    const response = await publish(jsonRequest("/api/agent/publish", { courseId: "course-1" }, { "x-confirm-destructive": "true" }));
    expect(response.status).toBe(400);
    expect(publishCourseInformationBundle).not.toHaveBeenCalled();
  });
});
