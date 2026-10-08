import { describe, expect, it } from "vitest";
import type { Plan, PlanPresentation } from "@/lib/db/schema";
import { isPublicPlanPresentation } from "./plan-presentations";

const now = new Date("2026-08-09T12:00:00.000Z");
const activePlan = { status: "active" } as Pick<Plan, "status">;
const publishedPresentation = {
  publishedAt: new Date("2026-08-09T11:00:00.000Z"),
  deletedAt: null,
} as Pick<PlanPresentation, "publishedAt" | "deletedAt">;

describe("isPublicPlanPresentation", () => {
  it("allows only an active plan with a due, non-deleted presentation", () => {
    expect(
      isPublicPlanPresentation(activePlan, publishedPresentation, now),
    ).toBe(true);
  });

  it.each([
    ["missing", null],
    ["draft", { ...publishedPresentation, publishedAt: null }],
    [
      "scheduled",
      {
        ...publishedPresentation,
        publishedAt: new Date("2026-08-09T13:00:00.000Z"),
      },
    ],
    ["soft-deleted", { ...publishedPresentation, deletedAt: now }],
  ])("rejects a %s presentation", (_state, presentation) => {
    expect(isPublicPlanPresentation(activePlan, presentation, now)).toBe(false);
  });

  it("rejects an inactive plan even when its presentation is published", () => {
    expect(
      isPublicPlanPresentation(
        { status: "inactive" },
        publishedPresentation,
        now,
      ),
    ).toBe(false);
  });
});
