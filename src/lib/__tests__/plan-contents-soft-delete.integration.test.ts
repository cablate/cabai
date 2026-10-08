/**
 * Soft-deleted planContents should never leak into delivery read paths.
 *
 * Regression test for the bug where deleted planContents (status visible to
 * users on /my/[planId] and similar pages because the queries forgot to
 * filter `isNull(deletedAt)`).
 *
 * Covers the lib-level functions; the page-level queries use the same
 * pattern and were fixed together.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";
import { planContents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cleanTestData, createTestPlan } from "@/test/helpers";
import { getPlanDeliveryStatus } from "@/lib/plan-delivery-status";
import { getDeliveryOverviewForPlans } from "@/lib/delivery";

let planId: string;

async function insertContent(overrides: {
  title?: string;
  deleted?: boolean;
}) {
  const [row] = await db
    .insert(planContents)
    .values({
      planId,
      title: overrides.title ?? "fixture",
      type: "text",
      content: "x",
      sortOrder: 0,
      deletedAt: overrides.deleted ? new Date() : null,
    })
    .returning();
  return row!.id;
}

beforeAll(async () => {
  await cleanTestData();
});

beforeEach(async () => {
  await db.delete(planContents);
  planId = (await createTestPlan()).id;
});

afterAll(async () => {
  await cleanTestData();
});

describe("getPlanDeliveryStatus — ignores soft-deleted planContents", () => {
  it("reports hasPlanContents=false when the only planContent is soft-deleted", async () => {
    await insertContent({ deleted: true });

    const status = await getPlanDeliveryStatus(planId);
    expect(status.hasPlanContents).toBe(false);
    expect(status.canDeliver).toBe(false);
  });

  it("reports hasPlanContents=true when at least one is live", async () => {
    await insertContent({ deleted: true, title: "ghost" });
    await insertContent({ deleted: false, title: "live" });

    const status = await getPlanDeliveryStatus(planId);
    expect(status.hasPlanContents).toBe(true);
  });
});

describe("getDeliveryOverviewForPlans — filters soft-deleted planContents", () => {
  it("does not surface deleted contents in the overview", async () => {
    const liveId = await insertContent({ deleted: false, title: "live" });
    const deletedId = await insertContent({ deleted: true, title: "ghost" });

    const map = await getDeliveryOverviewForPlans([planId]);
    const overview = map.get(planId);
    expect(overview).toBeDefined();
    const contentIds = overview!.contents.map((c) => c.id);
    expect(contentIds).toContain(liveId);
    expect(contentIds).not.toContain(deletedId);
  });
});

describe("planContents schema sanity", () => {
  it("soft-deleted record still exists in the row count when queried without filter", async () => {
    // Sanity: confirms the test is meaningful — the row IS there in the DB,
    // it's only the read-path filtering that hides it.
    const id = await insertContent({ deleted: true });
    const rows = await db
      .select()
      .from(planContents)
      .where(eq(planContents.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deletedAt).not.toBeNull();
  });
});
