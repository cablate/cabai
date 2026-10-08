import { db } from "@/lib/db";
import { media, skillReleases } from "@/lib/db/schema";
import { eq, and, inArray, lt, isNull, or, sql } from "drizzle-orm";
import { getStorageProvider, type StorageProvider } from "@/lib/storage";
import { createLogger } from "@/lib/logger";

const logger = createLogger("media-cleanup");
const PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const UNCONFIRMED_ORPHAN_DELETE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
// Confirmed media is not deleted automatically except an explicitly orphaned
// Skill draft artifact that is no longer referenced by any release.

type MediaCleanupCandidate = {
  id: string;
  storageKey: string;
};

export type MediaCleanupPreview = {
  orphanCandidates: MediaCleanupCandidate[];
  deletionCandidates: MediaCleanupCandidate[];
};

/**
 * Select every cleanup action from one database snapshot. Pending uploads older
 * than the deletion threshold remain eligible for deletion in the same run
 * after their prospective transition to orphaned.
 */
export async function previewOrphanedMediaCleanup(
  now: Date = new Date(),
): Promise<MediaCleanupPreview> {
  const pendingCutoff = new Date(now.getTime() - PENDING_UPLOAD_TTL_MS);
  const deleteCutoff = new Date(now.getTime() - UNCONFIRMED_ORPHAN_DELETE_AFTER_MS);
  const pendingCandidate = and(
    eq(media.status, "pending"),
    lt(media.createdAt, pendingCutoff),
  )!;
  const deletionCandidate = and(
    or(eq(media.status, "orphaned"), pendingCandidate),
    or(
      isNull(media.confirmedAt),
      and(
        eq(media.context, "skill-artifact"),
        sql`NOT EXISTS (
          SELECT 1 FROM ${skillReleases}
          WHERE ${skillReleases.artifactMediaId} = ${media.id}
        )`,
      ),
    ),
    lt(media.createdAt, deleteCutoff),
  )!;

  const candidates = await db
    .select({
      id: media.id,
      storageKey: media.storageKey,
      wouldOrphan: sql<boolean>`${pendingCandidate}`,
      wouldDelete: sql<boolean>`${deletionCandidate}`,
    })
    .from(media)
    .where(or(pendingCandidate, deletionCandidate));

  return {
    orphanCandidates: candidates
      .filter((candidate) => candidate.wouldOrphan)
      .map(({ id, storageKey }) => ({ id, storageKey })),
    deletionCandidates: candidates
      .filter((candidate) => candidate.wouldDelete)
      .map(({ id, storageKey }) => ({ id, storageKey })),
  };
}

/**
 * Conservative media cleanup for uploads that never finished confirmation.
 * - pending > 24 hours: mark orphaned
 * - unconfirmed orphaned > 7 days: delete R2 object + mark deleted
 */
export async function cleanupOrphanedMedia(storage: StorageProvider = getStorageProvider()): Promise<{
  orphaned: number;
  deleted: number;
  errors: number;
}> {
  const preview = await previewOrphanedMediaCleanup();
  const orphaned = preview.orphanCandidates.length;
  let deleted = 0;
  let errors = 0;

  // Step 1: Mark stale pending uploads as orphaned
  if (preview.orphanCandidates.length > 0) {
    await db
      .update(media)
      .set({ status: "orphaned" })
      .where(
        and(
          eq(media.status, "pending"),
          inArray(media.id, preview.orphanCandidates.map(({ id }) => id)),
        ),
      );
    logger.info("Marked stale uploads as orphaned", { count: orphaned });
  }

  // Step 2: Delete orphaned media from R2
  for (const item of preview.deletionCandidates) {
    try {
      await storage.delete(item.storageKey);
      await db
        .update(media)
        .set({ status: "deleted" })
        .where(eq(media.id, item.id));
      deleted++;
    } catch (err) {
      logger.error("Failed to delete orphaned media from R2", {
        mediaId: item.id,
        storageKey: item.storageKey,
        error: err instanceof Error ? err.message : String(err),
      });
      errors++;
    }
  }

  logger.info("Media cleanup complete", { orphaned, deleted, errors });
  return { orphaned, deleted, errors };
}

/**
 * Mark media as orphaned when its parent entity is deleted.
 */
export async function orphanMediaByEntity(
  entityType: string,
  entityId: string,
): Promise<number> {
  const result = await db
    .update(media)
    .set({ status: "orphaned", entityType: null, entityId: null })
    .where(
      and(
        eq(media.entityType, entityType),
        eq(media.entityId, entityId),
        eq(media.status, "confirmed"),
      ),
    )
    .returning({ id: media.id });

  return result.length;
}
