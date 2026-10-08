/**
 * Agent /api/agent/plans/[id]/contents — media binding lifecycle
 *
 * Verifies the three handlers correctly sync media:
 *   POST   → bindMediaAssetsFromContent
 *   PATCH  → bindMediaAssetsFromContent (bind + unbind via the synced helper)
 *   DELETE → orphanMediaByEntity
 *
 * Without these, agent-managed planContent rows leak bindings exactly like
 * the lesson PATCH bug we just fixed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, planContents } from "@/lib/db/schema";
import {
  createTestUser,
  createTestPlan,
  createTestAgentKey,
  agentRequest,
  cleanTestData,
} from "@/test/helpers";
import { POST as postPlanContent } from "@/app/api/agent/plans/[id]/contents/route";
import {
  PATCH as patchPlanContent,
  DELETE as deletePlanContent,
} from "@/app/api/agent/plans/[id]/contents/[contentId]/route";

let userId: string;
let key: string;
let planId: string;

async function insertMedia(overrides: {
  id?: string;
  status?: "pending" | "confirmed" | "orphaned" | "deleted";
  entityType?: string | null;
  entityId?: string | null;
}) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.insert(media).values({
    id,
    storageKey: `uploads/test/${id}.png`,
    publicUrl: `/api/assets/${id}`,
    filename: `${id}.png`,
    mimeType: "image/png",
    fileSize: 1234,
    context: "lesson-content",
    uploadedBy: userId,
    status: overrides.status ?? "pending",
    entityType: overrides.entityType ?? null,
    entityId: overrides.entityId ?? null,
    confirmedAt: overrides.status === "confirmed" ? new Date() : null,
  });
  return id;
}

async function readMedia(id: string) {
  const rec = await db.query.media.findFirst({ where: eq(media.id, id) });
  if (!rec) throw new Error(`media ${id} not found`);
  return rec;
}

beforeAll(async () => {
  await cleanTestData();
  userId = (await createTestUser()).id;
  const k = await createTestAgentKey(userId, [
    "delivery:write",
    "content:read",
  ]);
  key = k.fullKey;
  planId = (await createTestPlan()).id;
});

beforeEach(async () => {
  await db.delete(media);
  await db.delete(planContents);
});

afterAll(async () => {
  await cleanTestData();
});

describe("POST /api/agent/plans/[id]/contents — binds media on create", () => {
  it("confirms and binds media referenced in content", async () => {
    const m = await insertMedia({ status: "pending" });

    const req = agentRequest(`/api/agent/plans/${planId}/contents`, {
      method: "POST",
      key,
      body: {
        title: "Welcome",
        type: "text",
        content: `Hi ![](/api/assets/${m})`,
        sortOrder: 0,
      },
    });
    const res = await postPlanContent(req, {
      params: Promise.resolve({ id: planId }),
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { id: string } };
    const contentId = json.data.id;

    const after = await readMedia(m);
    expect(after.status).toBe("confirmed");
    expect(after.entityType).toBe("planContent");
    expect(after.entityId).toBe(contentId);
  });
});

describe("PATCH /api/agent/plans/[id]/contents/[contentId] — re-syncs bindings", () => {
  it("orphans media that was removed from content", async () => {
    // Seed planContent + media bound to it
    const [pc] = await db
      .insert(planContents)
      .values({ planId, title: "Pre", type: "text", content: "placeholder", sortOrder: 0 })
      .returning();
    const contentId = pc!.id;

    const stale = await insertMedia({
      status: "confirmed",
      entityType: "planContent",
      entityId: contentId,
    });
    const kept = await insertMedia({
      status: "confirmed",
      entityType: "planContent",
      entityId: contentId,
    });

    const req = agentRequest(
      `/api/agent/plans/${planId}/contents/${contentId}`,
      {
        method: "PATCH",
        key,
        body: { content: `keep only ![](/api/assets/${kept})` },
      },
    );
    const res = await patchPlanContent(req, {
      params: Promise.resolve({ id: planId, contentId }),
    });
    expect(res.status).toBe(200);

    expect((await readMedia(stale)).status).toBe("orphaned");
    expect((await readMedia(stale)).entityId).toBeNull();
    expect((await readMedia(kept)).status).toBe("confirmed");
  });

  it("does not touch media when PATCH does not include content", async () => {
    const [pc] = await db
      .insert(planContents)
      .values({ planId, title: "Pre", type: "text", content: "x", sortOrder: 0 })
      .returning();
    const contentId = pc!.id;

    const bound = await insertMedia({
      status: "confirmed",
      entityType: "planContent",
      entityId: contentId,
    });

    const req = agentRequest(
      `/api/agent/plans/${planId}/contents/${contentId}`,
      {
        method: "PATCH",
        key,
        body: { title: "Renamed only" },
      },
    );
    const res = await patchPlanContent(req, {
      params: Promise.resolve({ id: planId, contentId }),
    });
    expect(res.status).toBe(200);

    expect((await readMedia(bound)).status).toBe("confirmed");
    expect((await readMedia(bound)).entityId).toBe(contentId);
  });
});

describe("DELETE /api/agent/plans/[id]/contents/[contentId] — orphans bound media", () => {
  it("orphans every media bound to the deleted planContent", async () => {
    const [pc] = await db
      .insert(planContents)
      .values({ planId, title: "Pre", type: "text", content: "x", sortOrder: 0 })
      .returning();
    const contentId = pc!.id;

    const a = await insertMedia({
      status: "confirmed",
      entityType: "planContent",
      entityId: contentId,
    });
    const b = await insertMedia({
      status: "confirmed",
      entityType: "planContent",
      entityId: contentId,
    });

    const req = agentRequest(
      `/api/agent/plans/${planId}/contents/${contentId}`,
      {
        method: "DELETE",
        key,
        headers: {
          "x-confirm-destructive": "true",
          "x-confirm-entity-id": contentId,
        },
      },
    );
    const res = await deletePlanContent(req, {
      params: Promise.resolve({ id: planId, contentId }),
    });
    expect(res.status).toBe(200);

    expect((await readMedia(a)).status).toBe("orphaned");
    expect((await readMedia(a)).entityId).toBeNull();
    expect((await readMedia(b)).status).toBe("orphaned");
    expect((await readMedia(b)).entityId).toBeNull();
  });
});
