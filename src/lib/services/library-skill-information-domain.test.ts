import { describe, expect, it } from "vitest";
import {
  canTransition,
  domainFailureHttpStatus,
  informationKindSource,
  readinessResult,
} from "./library-skill-information-domain";

describe("library/skill/information domain contract", () => {
  it("keeps lifecycle transitions explicit", () => {
    expect(canTransition("library", "draft", "published")).toBe(true);
    expect(canTransition("library", "draft", "withdrawn")).toBe(false);
    expect(canTransition("skillRelease", "published", "deprecated")).toBe(true);
    expect(canTransition("skillRelease", "deprecated", "published")).toBe(false);
    expect(canTransition("information", "published", "withdrawn")).toBe(true);
  });

  it("derives readiness only from blocking issues", () => {
    expect(readinessResult([{ code: "invalid_format", field: "title", severity: "warning", message: "warn" }]).ready).toBe(true);
    expect(readinessResult([{ code: "required", field: "title", severity: "error", message: "missing" }]).ready).toBe(false);
  });

  it("maps stable service errors to the planned HTTP layer", () => {
    expect(domainFailureHttpStatus["stale-revision"]).toBe(409);
    expect(domainFailureHttpStatus["validation-failed"]).toBe(422);
    expect(domainFailureHttpStatus["prerequisite-unavailable"]).toBe(503);
  });

  it("locks information kinds to compatible source types", () => {
    expect(informationKindSource["skill.released"]).toBe("skill_release");
    expect(informationKindSource["api.capability-added"]).toBe("api_operation");
  });
});
