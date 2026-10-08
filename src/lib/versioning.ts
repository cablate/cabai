import { db } from "@/lib/db";
import { contentRevisions } from "@/lib/db/schema";
import { and, eq, desc, lt } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const logger = createLogger("versioning");

const MAX_VERSIONS_PER_ENTITY = 20;

/**
 * Create a revision snapshot before updating an entity.
 * Automatically prunes old versions beyond MAX_VERSIONS_PER_ENTITY.
 */
export async function createRevision(
  entityType: string,
  entityId: string,
  snapshot: Record<string, unknown>,
  changedBy: string,
  changeReason?: string,
): Promise<void> {
  try {
    // Get next version number
    const latest = await db
      .select({ version: contentRevisions.version })
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.entityType, entityType),
          eq(contentRevisions.entityId, entityId),
        ),
      )
      .orderBy(desc(contentRevisions.version))
      .limit(1);

    const nextVersion = (latest[0]?.version ?? 0) + 1;

    await db.insert(contentRevisions).values({
      entityType,
      entityId,
      version: nextVersion,
      snapshot,
      changedBy,
      changeReason,
    });

    // Prune old versions if exceeding limit
    if (nextVersion > MAX_VERSIONS_PER_ENTITY) {
      const cutoffVersion = nextVersion - MAX_VERSIONS_PER_ENTITY;
      await db
        .delete(contentRevisions)
        .where(
          and(
            eq(contentRevisions.entityType, entityType),
            eq(contentRevisions.entityId, entityId),
            lt(contentRevisions.version, cutoffVersion),
          ),
        );
    }
  } catch (err) {
    // Versioning failure should not block the update
    logger.error("Failed to create revision", {
      entityType,
      entityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get revision history for an entity, newest first.
 */
export async function getRevisions(
  entityType: string,
  entityId: string,
  limit = 10,
) {
  return db
    .select()
    .from(contentRevisions)
    .where(
      and(
        eq(contentRevisions.entityType, entityType),
        eq(contentRevisions.entityId, entityId),
      ),
    )
    .orderBy(desc(contentRevisions.version))
    .limit(limit);
}
