import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, skillReleases, skills } from "@/lib/db/schema";
import { cleanupOrphanedMedia } from "@/lib/media-cleanup";
import { cleanupAgentMedia } from "@/lib/services/agent-operations-service";
import { cleanTestData, createTestUser } from "@/test/helpers";
import { MemoryStorageProvider } from "@/test/skill-artifact-fixture";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
});

describe("media cleanup preview parity", () => {
  it("uses the same candidates for Agent dry-run and formal cleanup", async () => {
    const user = await createTestUser({
      email: `media-cleanup-${crypto.randomUUID()}@example.com`,
    });
    const storage = new MemoryStorageProvider();

    async function createMedia(input: {
      label: string;
      status: "pending" | "orphaned";
      context?: "plan-cover" | "skill-artifact";
      confirmed?: boolean;
      ageDays: number;
    }) {
      const storageKey = `media-cleanup/${input.label}-${crypto.randomUUID()}`;
      storage.put(storageKey, new Uint8Array([1]));
      const [record] = await db.insert(media).values({
        storageKey,
        publicUrl: `/assets/${input.label}`,
        filename: `${input.label}.bin`,
        mimeType: "application/octet-stream",
        fileSize: 1,
        context: input.context ?? "plan-cover",
        uploadedBy: user.id,
        status: input.status,
        createdAt: new Date(Date.now() - input.ageDays * DAY_MS),
        confirmedAt: input.confirmed ? new Date() : null,
      }).returning({ id: media.id, storageKey: media.storageKey });
      return record!;
    }

    const stalePending = await createMedia({
      label: "stale-pending",
      status: "pending",
      ageDays: 8,
    });
    const pendingAwaitingDeleteThreshold = await createMedia({
      label: "pending-awaiting-delete-threshold",
      status: "pending",
      ageDays: 2,
    });
    const unconfirmedOrphan = await createMedia({
      label: "unconfirmed-orphan",
      status: "orphaned",
      ageDays: 8,
    });
    const unreferencedSkillArtifact = await createMedia({
      label: "unreferenced-skill-artifact",
      status: "orphaned",
      context: "skill-artifact",
      confirmed: true,
      ageDays: 8,
    });
    const referencedSkillArtifact = await createMedia({
      label: "referenced-skill-artifact",
      status: "orphaned",
      context: "skill-artifact",
      confirmed: true,
      ageDays: 8,
    });
    const confirmedOtherMedia = await createMedia({
      label: "confirmed-other-media",
      status: "orphaned",
      confirmed: true,
      ageDays: 8,
    });
    const recentOrphan = await createMedia({
      label: "recent-orphan",
      status: "orphaned",
      ageDays: 1,
    });

    const [skill] = await db.insert(skills).values({
      slug: `media-cleanup-${crypto.randomUUID()}`,
      title: "Referenced cleanup fixture",
      summary: "Keeps a release-bound artifact out of cleanup.",
    }).returning({ id: skills.id });
    await db.insert(skillReleases).values({
      skillId: skill!.id,
      version: "1.0.0",
      artifactMediaId: referencedSkillArtifact.id,
    });

    await expect(cleanupAgentMedia({
      dryRun: true,
      actor: { agentId: "media-cleanup-test" },
    })).resolves.toEqual({
      dryRun: true,
      wouldOrphan: 2,
      wouldDelete: 3,
    });

    const beforeCleanup = await db.select({ id: media.id, status: media.status })
      .from(media)
      .where(inArray(media.id, [
        stalePending.id,
        pendingAwaitingDeleteThreshold.id,
        unconfirmedOrphan.id,
        unreferencedSkillArtifact.id,
      ]));
    expect(beforeCleanup).toEqual(expect.arrayContaining([
      { id: stalePending.id, status: "pending" },
      { id: pendingAwaitingDeleteThreshold.id, status: "pending" },
      { id: unconfirmedOrphan.id, status: "orphaned" },
      { id: unreferencedSkillArtifact.id, status: "orphaned" },
    ]));

    await expect(cleanupOrphanedMedia(storage)).resolves.toEqual({
      orphaned: 2,
      deleted: 3,
      errors: 0,
    });

    const rows = await db.select({ id: media.id, status: media.status }).from(media);
    const statuses = new Map(rows.map((row) => [row.id, row.status]));
    expect(statuses.get(stalePending.id)).toBe("deleted");
    expect(statuses.get(pendingAwaitingDeleteThreshold.id)).toBe("orphaned");
    expect(statuses.get(unconfirmedOrphan.id)).toBe("deleted");
    expect(statuses.get(unreferencedSkillArtifact.id)).toBe("deleted");
    expect(statuses.get(referencedSkillArtifact.id)).toBe("orphaned");
    expect(statuses.get(confirmedOtherMedia.id)).toBe("orphaned");
    expect(statuses.get(recentOrphan.id)).toBe("orphaned");

    expect(storage.objects.has(stalePending.storageKey)).toBe(false);
    expect(storage.objects.has(pendingAwaitingDeleteThreshold.storageKey)).toBe(true);
    expect(storage.objects.has(unconfirmedOrphan.storageKey)).toBe(false);
    expect(storage.objects.has(unreferencedSkillArtifact.storageKey)).toBe(false);
    expect(storage.objects.has(referencedSkillArtifact.storageKey)).toBe(true);
    expect(storage.objects.has(confirmedOtherMedia.storageKey)).toBe(true);
    expect(storage.objects.has(recentOrphan.storageKey)).toBe(true);
  });
});
