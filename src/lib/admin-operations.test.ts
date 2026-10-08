import { describe, expect, it } from "vitest";
import {
  buildAdminOperationsOverview,
  loadAdminOperationsCounts,
  type AdminOperationsCounts,
  type AdminOperationsSignalLoaders,
} from "./admin-operations";
import { adminOperationSignalIds } from "./agent/operations-schemas";

const emptyCounts: AdminOperationsCounts = {
  deadWebhookDeliveries: 0,
  deadEntitlementTransitions: 0,
  orphanedMedia: 0,
  oldPendingOrders: 0,
  draftCourses: 0,
  draftLibraryEntries: 0,
  draftSkills: 0,
  draftInformation: 0,
  incompleteActivePlans: 0,
};

describe("buildAdminOperationsOverview", () => {
  it("does not manufacture tasks when repository counts are zero", () => {
    expect(buildAdminOperationsOverview(emptyCounts)).toEqual({
      urgent: [],
      work: [],
      total: 0,
      status: "ok",
      completeness: "complete",
      unavailableSignals: [],
      observedAt: expect.any(String),
    });
  });

  it("separates incidents from unfinished editorial work", () => {
    const result = buildAdminOperationsOverview({
      ...emptyCounts,
      deadWebhookDeliveries: 1,
      deadEntitlementTransitions: 1,
      oldPendingOrders: 1,
      draftLibraryEntries: 3,
      incompleteActivePlans: 1,
    });

    expect(result.urgent.map((item) => item.id)).toEqual([
      "dead-letter",
      "old-pending-orders",
    ]);
    expect(result.work.map((item) => item.id)).toEqual([
      "incomplete-plans",
      "draft-library",
    ]);
    expect(result.total).toBe(7);
    expect(result.status).toBe("ok");
    expect(result.completeness).toBe("complete");
  });

  it("keeps unavailable values unknown instead of treating them as zero", () => {
    const result = buildAdminOperationsOverview({
      ...emptyCounts,
      deadWebhookDeliveries: null,
      draftSkills: null,
    });

    expect(result.status).toBe("degraded");
    expect(result.completeness).toBe("partial");
    expect(result.total).toBeNull();
    expect(result.unavailableSignals).toEqual(["deadWebhookDeliveries", "draftSkills"]);
    expect(result.urgent).toContainEqual(expect.objectContaining({ id: "dead-letter", count: null }));
    expect(result.work).toContainEqual(expect.objectContaining({ id: "draft-skills", count: null }));
  });

  it("isolates failed source loaders to their own signal", async () => {
    const loaders = Object.fromEntries(adminOperationSignalIds.map((signal) => [
      signal,
      signal === "draftCourses"
        ? async () => { throw new Error("injected signal failure"); }
        : async () => 0,
    ])) as AdminOperationsSignalLoaders;

    await expect(loadAdminOperationsCounts(loaders)).resolves.toEqual({
      ...emptyCounts,
      draftCourses: null,
    });
  });
});
