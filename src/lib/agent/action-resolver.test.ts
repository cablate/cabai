import { describe, expect, it } from "vitest";
import {
  listAgentOperations,
  resolveAgentOperation,
  resolveInformationActionOperation,
  validateActionParameters,
} from "./action-resolver";

describe("Agent OpenAPI action resolver", () => {
  it("derives unique operations from the canonical OpenAPI document", () => {
    const operations = listAgentOperations();
    expect(operations.length).toBeGreaterThan(0);
    expect(new Set(operations.map((operation) => operation.operationId)).size).toBe(operations.length);
  });

  it("resolves the existing user course operation and its locked metadata", () => {
    const operation = resolveInformationActionOperation("getUserCourseContent");
    expect(operation).toMatchObject({
      method: "get",
      path: "/api/agent/courses/{id}/content",
      credential: "user",
      requiredScope: "course:read",
    });
    expect(validateActionParameters(operation!, { id: "course_1" })).toBe(true);
    expect(validateActionParameters(operation!, { id: "course_1", invented: "x" })).toBe(false);
  });

  it("does not expose admin-only operations as Information actions", () => {
    expect(resolveAgentOperation("createCourse")?.credential).toBe("agent");
    expect(resolveInformationActionOperation("createCourse")).toBeNull();
    expect(resolveInformationActionOperation("notReal")).toBeNull();
  });
});
