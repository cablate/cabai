import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { GET } from "./route";
import { buildAgentOpenApi } from "@/lib/agent/openapi";
import { requireAgent } from "@/lib/agent-auth";

vi.mock("@/lib/agent-auth", () => ({
  requireAgent: vi.fn().mockResolvedValue({
    keyId: "test-key",
    name: "test-agent",
    agentId: "agent-key:test-key",
    permissions: [],
  }),
}));

describe("Agent OpenAPI YAML discovery route", () => {
  it("does not expose the full contract without a valid Admin key", async () => {
    vi.mocked(requireAgent).mockRejectedValueOnce(new Response(
      JSON.stringify({ error: "Invalid, expired, or missing API key" }),
      { status: 401 },
    ));

    const response = await GET(new Request("https://example.test/api/agent/openapi.yaml"));

    expect(response.status).toBe(401);
  });

  it("serves the current generated contract as cacheable YAML", async () => {
    const response = await GET(new Request("https://example.test/api/agent/openapi.yaml", {
      headers: { Authorization: "Bearer cab_agent_test" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/yaml; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(parse(await response.text())).toEqual(buildAgentOpenApi());
  });
});
