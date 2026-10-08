import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { appUrl } from "@/lib/app-url";

export const PRIVATE_MEDIA_CONTEXTS = new Set(["lesson-content", "service-guide", "skill-artifact"]);

export type MediaEntityType =
  | "lesson"
  | "planContent"
  | "course"
  | "plan"
  | "planPresentation"
  | "skillRelease";

export function isPrivateMediaContext(context: string): boolean {
  return PRIVATE_MEDIA_CONTEXTS.has(context);
}

export function mediaContextCanBindToEntity(
  context: string,
  entityType?: MediaEntityType,
): boolean {
  if (!entityType) return context !== "skill-artifact";
  if (context === "lesson-content") return entityType === "lesson" || entityType === "planContent";
  if (context === "service-guide") return entityType === "planContent" || entityType === "plan";
  if (context === "course-image" || context === "lesson-thumbnail") {
    return entityType === "course" || entityType === "lesson";
  }
  if (context === "plan-cover" || context === "plan-banner") {
    return entityType === "plan" || entityType === "planPresentation";
  }
  if (context === "skill-artifact") return entityType === "skillRelease";
  return false;
}

export function assetPath(mediaId: string): string {
  return `/api/assets/${mediaId}`;
}

export function absoluteAssetUrl(mediaId: string): string {
  return appUrl(assetPath(mediaId));
}

export function extractMediaIdsFromContent(content: string): string[] {
  const ids = new Set<string>();
  const pattern = /\/api\/assets\/([^/?#"' <>)\s]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match[1]) ids.add(match[1]);
  }

  return [...ids];
}

/**
 * Sync media bindings so content is the source of truth.
 *
 * - IDs referenced in content → bound to (entityType, entityId) and confirmed.
 * - Media currently bound to (entityType, entityId) but no longer referenced
 *   → orphaned (status=orphaned, entityType/entityId cleared), so it can be
 *   cleaned via DELETE /api/agent/media/[id].
 *
 * Without the unbind step, removing an image from content leaves a stale
 * binding that prevents the media from ever being deleted (DELETE rejects
 * confirmed+bound media). The unbind ignores `uploadedBy` because the
 * binding itself is the source of truth — anyone with edit rights to the
 * entity can free its media.
 */
export async function bindMediaAssetsFromContent(
  content: string,
  entityType: MediaEntityType,
  entityId: string,
  uploadedBy?: string,
): Promise<void> {
  const ids = extractMediaIdsFromContent(content);

  if (ids.length > 0) {
    const bindConditions = [inArray(media.id, ids)];
    if (uploadedBy) bindConditions.push(eq(media.uploadedBy, uploadedBy));

    await db
      .update(media)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
        entityType,
        entityId,
      })
      .where(and(...bindConditions));
  }

  const unbindConditions = [
    eq(media.entityType, entityType),
    eq(media.entityId, entityId),
    eq(media.status, "confirmed"),
  ];
  if (ids.length > 0) {
    unbindConditions.push(notInArray(media.id, ids));
  }

  await db
    .update(media)
    .set({
      status: "orphaned",
      entityType: null,
      entityId: null,
    })
    .where(and(...unbindConditions));
}
