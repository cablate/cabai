/**
 * media-assets: bindMediaAssetsFromContent
 *
 * Real DB. Verifies content is treated as the source of truth — media
 * referenced in content gets bound, and media that lost its reference gets
 * orphaned so it can be cleaned via DELETE /api/agent/media/[id].
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cleanTestData, createTestUser } from "@/test/helpers";
import {
  bindMediaAssetsFromContent,
  extractMediaIdsFromContent,
} from "@/lib/media-assets";

let uploaderId: string;
let otherUploaderId: string;
const ENTITY_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_ENTITY_ID = "00000000-0000-0000-0000-000000000002";

async function insertMedia(overrides: {
  id?: string;
  status?: "pending" | "confirmed" | "orphaned" | "deleted";
  entityType?: string | null;
  entityId?: string | null;
  uploadedBy?: string;
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
    uploadedBy: overrides.uploadedBy ?? uploaderId,
    status: overrides.status ?? "confirmed",
    entityType: overrides.entityType ?? "lesson",
    entityId: overrides.entityId ?? ENTITY_ID,
    confirmedAt: new Date(),
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
  uploaderId = (await createTestUser()).id;
  otherUploaderId = (await createTestUser()).id;
});

beforeEach(async () => {
  await db.delete(media);
});

afterAll(async () => {
  await cleanTestData();
});

describe("extractMediaIdsFromContent", () => {
  it("extracts ids from markdown image refs", () => {
    const content = `
      ![alt one](/api/assets/aaaa1111-1111-1111-1111-111111111111)
      ![alt two](/api/assets/bbbb2222-2222-2222-2222-222222222222)
    `;
    const ids = extractMediaIdsFromContent(content);
    expect(ids).toEqual(
      expect.arrayContaining([
        "aaaa1111-1111-1111-1111-111111111111",
        "bbbb2222-2222-2222-2222-222222222222",
      ]),
    );
    expect(ids.length).toBe(2);
  });

  it("returns empty array when no asset refs", () => {
    expect(extractMediaIdsFromContent("hello world")).toEqual([]);
  });

  it("deduplicates repeated ids", () => {
    const content =
      "![a](/api/assets/xxxx-xx) and again ![a](/api/assets/xxxx-xx)";
    expect(extractMediaIdsFromContent(content)).toEqual(["xxxx-xx"]);
  });

  it("stops a bare asset URL at the following newline", () => {
    const content = "/api/assets/download-asset-id\n[]";
    expect(extractMediaIdsFromContent(content)).toEqual(["download-asset-id"]);
  });
});

describe("bindMediaAssetsFromContent — bind step", () => {
  it("binds a pending download referenced as a bare lesson URL", async () => {
    const id = await insertMedia({
      status: "pending",
      entityType: null,
      entityId: null,
    });

    await bindMediaAssetsFromContent(
      `/api/assets/${id}\n[]`,
      "lesson",
      ENTITY_ID,
    );

    const after = await readMedia(id);
    expect(after.status).toBe("confirmed");
    expect(after.entityType).toBe("lesson");
    expect(after.entityId).toBe(ENTITY_ID);
  });

  it("binds pending media referenced in content", async () => {
    const id = await insertMedia({
      status: "pending",
      entityType: null,
      entityId: null,
    });

    await bindMediaAssetsFromContent(
      `![](/api/assets/${id})`,
      "lesson",
      ENTITY_ID,
    );

    const after = await readMedia(id);
    expect(after.status).toBe("confirmed");
    expect(after.entityType).toBe("lesson");
    expect(after.entityId).toBe(ENTITY_ID);
    expect(after.confirmedAt).not.toBeNull();
  });

  it("respects uploadedBy filter — only binds media uploaded by caller", async () => {
    const mine = await insertMedia({
      status: "pending",
      entityType: null,
      entityId: null,
      uploadedBy: uploaderId,
    });
    const theirs = await insertMedia({
      status: "pending",
      entityType: null,
      entityId: null,
      uploadedBy: otherUploaderId,
    });

    await bindMediaAssetsFromContent(
      `![](/api/assets/${mine}) ![](/api/assets/${theirs})`,
      "lesson",
      ENTITY_ID,
      uploaderId,
    );

    expect((await readMedia(mine)).status).toBe("confirmed");
    expect((await readMedia(theirs)).status).toBe("pending");
  });
});

describe("bindMediaAssetsFromContent — unbind step (the fix)", () => {
  it("orphans media that was bound but is no longer referenced", async () => {
    const stale = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });
    const kept = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });

    await bindMediaAssetsFromContent(
      `![](/api/assets/${kept})`,
      "lesson",
      ENTITY_ID,
    );

    const staleAfter = await readMedia(stale);
    expect(staleAfter.status).toBe("orphaned");
    expect(staleAfter.entityType).toBeNull();
    expect(staleAfter.entityId).toBeNull();

    const keptAfter = await readMedia(kept);
    expect(keptAfter.status).toBe("confirmed");
    expect(keptAfter.entityId).toBe(ENTITY_ID);
  });

  it("orphans ALL bound media when content has no refs", async () => {
    const a = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });
    const b = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });

    await bindMediaAssetsFromContent("plain text, no images", "lesson", ENTITY_ID);

    expect((await readMedia(a)).status).toBe("orphaned");
    expect((await readMedia(b)).status).toBe("orphaned");
  });

  it("does not touch media bound to a different entity", async () => {
    const mine = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });
    const sibling = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: OTHER_ENTITY_ID,
    });

    await bindMediaAssetsFromContent("no refs", "lesson", ENTITY_ID);

    expect((await readMedia(mine)).status).toBe("orphaned");
    expect((await readMedia(sibling)).status).toBe("confirmed");
    expect((await readMedia(sibling)).entityId).toBe(OTHER_ENTITY_ID);
  });

  it("does not touch media bound to a different entityType (same id reuse)", async () => {
    const lesson = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });
    const presentation = await insertMedia({
      status: "confirmed",
      entityType: "planPresentation",
      entityId: ENTITY_ID,
    });

    await bindMediaAssetsFromContent("no refs", "lesson", ENTITY_ID);

    expect((await readMedia(lesson)).status).toBe("orphaned");
    expect((await readMedia(presentation)).status).toBe("confirmed");
  });

  it("ignores uploadedBy when unbinding — anyone editing the entity can free its media", async () => {
    const theirsButStale = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: ENTITY_ID,
      uploadedBy: otherUploaderId,
    });

    await bindMediaAssetsFromContent(
      "removed all images",
      "lesson",
      ENTITY_ID,
      uploaderId, // bind filter = me, but unbind ignores this
    );

    expect((await readMedia(theirsButStale)).status).toBe("orphaned");
  });

  it("does not flip pending/orphaned/deleted media — only confirmed gets unbound", async () => {
    const pending = await insertMedia({
      status: "pending",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });
    const alreadyOrphan = await insertMedia({
      status: "orphaned",
      entityType: null,
      entityId: null,
    });
    const deleted = await insertMedia({
      status: "deleted",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });

    await bindMediaAssetsFromContent("no refs", "lesson", ENTITY_ID);

    expect((await readMedia(pending)).status).toBe("pending");
    expect((await readMedia(alreadyOrphan)).status).toBe("orphaned");
    expect((await readMedia(deleted)).status).toBe("deleted");
  });

  it("mixed sync — adds new, keeps existing, orphans removed", async () => {
    const stale = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });
    const kept = await insertMedia({
      status: "confirmed",
      entityType: "lesson",
      entityId: ENTITY_ID,
    });
    const fresh = await insertMedia({
      status: "pending",
      entityType: null,
      entityId: null,
    });

    await bindMediaAssetsFromContent(
      `![](/api/assets/${kept}) ![](/api/assets/${fresh})`,
      "lesson",
      ENTITY_ID,
    );

    expect((await readMedia(stale)).status).toBe("orphaned");
    expect((await readMedia(kept)).status).toBe("confirmed");
    expect((await readMedia(kept)).entityId).toBe(ENTITY_ID);
    expect((await readMedia(fresh)).status).toBe("confirmed");
    expect((await readMedia(fresh)).entityId).toBe(ENTITY_ID);
  });
});
