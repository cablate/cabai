import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { GET } from "./route";
import { buildUserAgentOpenApi } from "@/lib/agent/openapi";

describe("User Agent OpenAPI YAML discovery route", () => {
  it("serves the user-safe generated contract without credentials", async () => {
    const response = GET();
    const document = parse(await response.text());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/yaml; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    expect(document).toEqual(buildUserAgentOpenApi());
    const operations = Object.values(document.paths as Record<string, Record<string, unknown>>)
      .flatMap((pathItem) => Object.values(pathItem))
      .filter((operation) => operation && typeof operation === "object");
    expect(operations.every((operation) => {
      const security = (operation as Record<string, unknown>).security as Array<Record<string, unknown>> | undefined;
      return security === undefined || security.every((requirement) => !Object.hasOwn(requirement, "agentKey"));
    })).toBe(true);
    expect(document.components.securitySchemes).toEqual({ userKey: expect.any(Object) });
  });
});
