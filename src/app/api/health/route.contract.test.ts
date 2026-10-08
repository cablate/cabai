import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbExecute, logger } = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: { execute: dbExecute } }));
vi.mock("@/lib/logger", () => ({ createLogger: () => logger }));

import { dynamic, GET } from "@/app/api/health/route";

describe("public health route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the public liveness response stable and correlated", async () => {
    const response = await GET(
      new Request("https://example.com/api/health", { method: "GET" }),
    );

    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);

    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
    await expect(response.json()).resolves.toEqual({ status: "ok" });

    expect(logger.info).toHaveBeenCalledWith("API request completed", {
      requestId,
      operation: "check health",
      method: "GET",
      status: 200,
      durationMs: expect.any(Number),
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("does not turn liveness into a database probe", async () => {
    await GET(new Request("https://example.com/api/health"));

    expect(dbExecute).not.toHaveBeenCalled();
  });
});
