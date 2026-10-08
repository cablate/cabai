import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { cleanTestData, createTestAgentKey, createTestUser } from "@/test/helpers";
const mocks = vi.hoisted(() => ({ head: vi.fn(), bind: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => ({ head: mocks.head }) }));
vi.mock("@/lib/services/skill-artifact-service", () => ({ bindAndValidateDraftSkillArtifact: mocks.bind }));
import { POST } from "./route";
beforeEach(async () => { await cleanTestData(); vi.clearAllMocks(); });
afterAll(cleanTestData);

describe("real agent credentials cannot cross Skill mutation scope", () => {
  it.each(["pending", "confirmed"] as const)("leaves %s Skill media unchanged for media-only keys", async (status) => {
    const user = await createTestUser({ role: "admin" });
    const key = await createTestAgentKey(user.id, ["media:write"]);
    const [record] = await db.insert(media).values({
      storageKey: crypto.randomUUID(), publicUrl: "/api/assets/example", filename: "example.zip",
      mimeType: "application/zip", fileSize: 100, context: "skill-artifact", uploadedBy: user.id, status,
      entityType: status === "confirmed" ? "skillRelease" : null,
      entityId: status === "confirmed" ? "release-1" : null,
    }).returning();
    const response = await POST(new Request("https://example.com/api/upload/confirm", {
      method: "POST", headers: { authorization: `Bearer ${key.fullKey}` },
      body: JSON.stringify({ storageKey: record!.storageKey, entityType: "skillRelease", entityId: "release-1", expectedEntityRevision: 1 }),
    }));
    expect(response.status).toBe(403);
    const [unchanged] = await db.select().from(media).where(eq(media.id, record!.id));
    expect(unchanged).toEqual(record);
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
  });
});
