import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { validatePlanSlug, looksLikeUuid, RESERVED_PLAN_SLUGS } from "@/lib/validate-plan-slug";
import { resolvePlanByIdOrSlug } from "@/lib/plans-local";
import { planPath } from "@/lib/plan-url";
import { createTestPlan } from "@/test/helpers";

describe("validatePlanSlug", () => {
  it("accepts a typical slug", () => {
    const r = validatePlanSlug("cc-deep-engineering");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slug).toBe("cc-deep-engineering");
  });

  it("normalises uppercase + whitespace before validating", () => {
    const r = validatePlanSlug("  Foo-Bar  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.slug).toBe("foo-bar");
  });

  it("rejects empty / too-short slugs", () => {
    expect(validatePlanSlug("").ok).toBe(false);
    expect(validatePlanSlug("a").ok).toBe(false);
    expect(validatePlanSlug("ab").ok).toBe(false);
  });

  it("rejects over-long slugs (>60)", () => {
    const tooLong = "a".repeat(61);
    expect(validatePlanSlug(tooLong).ok).toBe(false);
  });

  it("rejects underscores, spaces, and non-ASCII", () => {
    expect(validatePlanSlug("foo_bar").ok).toBe(false);
    expect(validatePlanSlug("foo bar").ok).toBe(false);
    expect(validatePlanSlug("手冊").ok).toBe(false);
  });

  it("rejects leading / trailing / consecutive dashes", () => {
    expect(validatePlanSlug("-foo").ok).toBe(false);
    expect(validatePlanSlug("foo-").ok).toBe(false);
    expect(validatePlanSlug("foo--bar").ok).toBe(false);
  });

  it("rejects UUID-shaped strings", () => {
    expect(validatePlanSlug("987c20f5-b0bb-44c1-bdfd-d3fa2625117c").ok).toBe(false);
  });

  it("rejects reserved words", () => {
    for (const reserved of ["admin", "api", "products", "checkout", "my", "login"]) {
      const r = validatePlanSlug(reserved);
      expect(r.ok, `${reserved} should be reserved`).toBe(false);
      if (!r.ok) expect(r.error).toBe("reserved");
    }
  });

  it("RESERVED_PLAN_SLUGS contains every top-level public route segment", () => {
    for (const r of ["products", "checkout", "my", "login", "admin", "api"]) {
      expect(RESERVED_PLAN_SLUGS.has(r)).toBe(true);
    }
  });
});

describe("looksLikeUuid", () => {
  it("matches the canonical 8-4-4-4-12 form", () => {
    expect(looksLikeUuid("987c20f5-b0bb-44c1-bdfd-d3fa2625117c")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(looksLikeUuid("987C20F5-B0BB-44C1-BDFD-D3FA2625117C")).toBe(true);
  });

  it("rejects shapes that are off by one segment", () => {
    expect(looksLikeUuid("987c20f5-b0bb-44c1-bdfd-d3fa2625117")).toBe(false);
    expect(looksLikeUuid("987c20f5-b0bb-44c1-bdfd-d3fa2625117cc")).toBe(false);
    expect(looksLikeUuid("987c20f5b0bb44c1bdfdd3fa2625117c")).toBe(false);
  });

  it("rejects ordinary slug strings", () => {
    expect(looksLikeUuid("cc-deep-engineering")).toBe(false);
    expect(looksLikeUuid("foo")).toBe(false);
  });
});

describe("resolvePlanByIdOrSlug", () => {
  // Use a UUID-shaped id so it goes through the UUID path of the resolver.
  const PLAN_UUID = "11111111-2222-3333-4444-555555555555";
  const PLAN_SLUG = "test-plan-slug-resolver";

  beforeEach(async () => {
    // Clean state between tests; another suite may have inserted rows.
    await db.delete(plans).where(sql`id = ${PLAN_UUID}`);
    await db.delete(plans).where(sql`slug = ${PLAN_SLUG}`);
  });

  it("returns plan when looked up by UUID id", async () => {
    await createTestPlan({ id: PLAN_UUID, slug: PLAN_SLUG });
    const plan = await resolvePlanByIdOrSlug(PLAN_UUID);
    expect(plan?.id).toBe(PLAN_UUID);
    expect(plan?.slug).toBe(PLAN_SLUG);
  });

  it("returns plan when looked up by slug", async () => {
    await createTestPlan({ id: PLAN_UUID, slug: PLAN_SLUG });
    const plan = await resolvePlanByIdOrSlug(PLAN_SLUG);
    expect(plan?.id).toBe(PLAN_UUID);
  });

  it("returns undefined for unknown UUID", async () => {
    const plan = await resolvePlanByIdOrSlug("99999999-9999-9999-9999-999999999999");
    expect(plan).toBeUndefined();
  });

  it("returns undefined for unknown slug", async () => {
    const plan = await resolvePlanByIdOrSlug("definitely-not-a-real-slug-xyz");
    expect(plan).toBeUndefined();
  });

  it("does not confuse a UUID-shaped string for a slug", async () => {
    // Insert a plan with a non-UUID id AND a slug that doesn't look like a UUID.
    // Then query with a UUID-shaped string that exists nowhere — should NOT
    // accidentally match by slug.
    await createTestPlan({ id: PLAN_UUID, slug: PLAN_SLUG });
    const phantom = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const plan = await resolvePlanByIdOrSlug(phantom);
    expect(plan).toBeUndefined();
  });

  it("falls back to id lookup for a non-UUID friendly id when slug misses", async () => {
    // Agent-created plans can have friendly ids (e.g.
    // "ai-coding-pain-points-manual"). After a slug rename, the original
    // id string should still resolve.
    const friendlyId = "test-friendly-id-fallback";
    await db.delete(plans).where(sql`id = ${friendlyId}`);
    await createTestPlan({ id: friendlyId, slug: "different-slug" });
    const plan = await resolvePlanByIdOrSlug(friendlyId);
    expect(plan?.id).toBe(friendlyId);
    expect(plan?.slug).toBe("different-slug");
    // Cleanup
    await db.delete(plans).where(sql`id = ${friendlyId}`);
  });

  it("prefers slug match over id match on ambiguous strings", async () => {
    // Pathological case: plan A has id="foo", plan B has slug="foo".
    // Slug should win (URL-canonical field).
    const idA = "ambiguous-id-test";
    const idB = "ambiguous-slug-test";
    await db.delete(plans).where(sql`id = ${idA}`);
    await db.delete(plans).where(sql`id = ${idB}`);
    await createTestPlan({ id: idA, slug: null });
    await createTestPlan({ id: idB, slug: idA });
    const plan = await resolvePlanByIdOrSlug(idA);
    expect(plan?.id).toBe(idB); // slug match wins
    // Cleanup
    await db.delete(plans).where(sql`id = ${idA}`);
    await db.delete(plans).where(sql`id = ${idB}`);
  });
});

describe("planPath", () => {
  it("uses slug when present", () => {
    expect(planPath({ id: "uuid-x", slug: "cool-plan" }, "product")).toBe("/products/cool-plan");
    expect(planPath({ id: "uuid-x", slug: "cool-plan" }, "checkout")).toBe("/checkout/cool-plan");
    expect(planPath({ id: "uuid-x", slug: "cool-plan" }, "my")).toBe("/my/cool-plan");
  });

  it("falls back to id when slug is null", () => {
    expect(planPath({ id: "uuid-x", slug: null }, "product")).toBe("/products/uuid-x");
  });

  it("falls back to id when slug is undefined", () => {
    expect(planPath({ id: "uuid-x" }, "my")).toBe("/my/uuid-x");
  });
});
