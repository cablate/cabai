/**
 * Tests metadataJson shallow-merge behavior on PATCH presentation.
 *
 * Sending { urgencyNote: "..." } should NOT wipe other fields like
 * faqItems, audienceItems, painPoints, etc.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { planPresentations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createTestUser,
  createTestPlan,
  createTestAgentKey,
  agentRequest,
  cleanTestData,
} from "@/test/helpers";
import { PATCH as patchPresentation } from "@/app/api/agent/plans/[id]/presentation/route";

let userId: string;
let key: string;
let planId: string;

beforeAll(async () => {
  await cleanTestData();
  const user = await createTestUser({ email: "test-merge@example.com", role: "admin" });
  userId = user.id;
  const k = await createTestAgentKey(userId, ["plan:write", "content:read"]);
  key = k.fullKey;
  const plan = await createTestPlan({ name: "Merge Test Plan" });
  planId = plan.id;
});

afterAll(async () => {
  await cleanTestData();
});

describe("presentation metadataJson merge", () => {
  it("shallow-merges new fields into existing metadataJson", async () => {
    // 1. Create initial presentation with multiple metadataJson fields
    const createReq = agentRequest(`/api/agent/plans/${planId}/presentation`, {
      method: "PATCH",
      key,
      body: {
        offeringType: "course",
        title: "Merge Test Course",
        metadataJson: {
          urgencyNote: "限時優惠",
          painPoints: ["問題 A", "問題 B"],
          audienceItems: ["開發者 A", "開發者 B"],
          faqItems: [{ q: "這是測試嗎？", a: "是的" }],
        },
      },
    });
    const createResp = await patchPresentation(createReq, {
      params: Promise.resolve({ id: planId }),
    });
    expect(createResp.status).toBe(200);

    // 2. PATCH with only one new field — should merge, not replace
    const mergeReq = agentRequest(`/api/agent/plans/${planId}/presentation`, {
      method: "PATCH",
      key,
      body: {
        metadataJson: {
          urgencyNote: "已更新",
        },
      },
    });
    const mergeResp = await patchPresentation(mergeReq, {
      params: Promise.resolve({ id: planId }),
    });
    expect(mergeResp.status).toBe(200);

    // 3. Verify all original fields still exist
    const row = await db.query.planPresentations.findFirst({
      where: eq(planPresentations.planId, planId),
    });
    const meta = row?.metadataJson as Record<string, unknown> | null;
    expect(meta).not.toBeNull();
    expect(meta!.urgencyNote).toBe("已更新");
    expect(meta!.painPoints).toEqual(["問題 A", "問題 B"]);
    expect(meta!.audienceItems).toEqual(["開發者 A", "開發者 B"]);
    expect(meta!.faqItems).toEqual([{ q: "這是測試嗎？", a: "是的" }]);
  });

  it("preserves existing fields when sending partial metadataJson", async () => {
    // Merge behavior: sending only one field keeps all others
    const partialReq = agentRequest(`/api/agent/plans/${planId}/presentation`, {
      method: "PATCH",
      key,
      body: {
        metadataJson: {
          onlyField: "新增欄位",
        },
      },
    });
    const partialResp = await patchPresentation(partialReq, {
      params: Promise.resolve({ id: planId }),
    });
    expect(partialResp.status).toBe(200);

    const row = await db.query.planPresentations.findFirst({
      where: eq(planPresentations.planId, planId),
    });
    const meta = row?.metadataJson as Record<string, unknown> | null;
    expect(meta?.onlyField).toBe("新增欄位");
    // Previously-set fields should still exist after merge
    expect(meta?.urgencyNote).toBe("已更新");
    expect(meta?.painPoints).toEqual(["問題 A", "問題 B"]);
    expect(meta?.audienceItems).toEqual(["開發者 A", "開發者 B"]);
  });
});
