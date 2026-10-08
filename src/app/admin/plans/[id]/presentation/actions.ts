"use server";

import { db } from "@/lib/db";
import { planPresentations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminAction } from "@/lib/admin-action-guard";
import { createLogger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { writeAuditLog, computeChanges } from "@/lib/audit";
import { createRevision } from "@/lib/versioning";
import { expirePublicSiteCache } from "@/lib/public-site-cache-invalidation";

const logger = createLogger("presentation-action");

function revalidatePresentationPaths(planId: string) {
  revalidatePath(`/admin/plans/${planId}`);
  revalidatePath("/admin/plans");
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath(`/products/${planId}`);
  expirePublicSiteCache("plans");
}

/**
 * Save (create or update) a plan presentation.
 */
export async function savePresentationAction(
  planId: string,
  formData: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("plan-presentation:save");

    logger.info("save presentation", { planId, userId: session.user.id });

    if (!formData.title || typeof formData.title !== "string") {
      return { success: false, error: "Title is required" };
    }

    if (!formData.offeringType || typeof formData.offeringType !== "string") {
      return { success: false, error: "Offering type is required" };
    }

    // Check for existing presentation to create revision
    const existing = await db.query.planPresentations.findFirst({
      where: eq(planPresentations.planId, planId),
    });

    if (existing) {
      await createRevision(
        "planPresentation",
        existing.id,
        existing as unknown as Record<string, unknown>,
        session.user.id,
      );
    }

    const offeringType = formData.offeringType as
      | "course"
      | "lecture"
      | "free_event"
      | "offline_event"
      | "service"
      | "membership"
      | "download";

    const presentationData = {
      planId,
      offeringType,
      title: formData.title as string,
      subtitle:
        typeof formData.subtitle === "string" ? formData.subtitle : null,
      description:
        typeof formData.description === "string"
          ? formData.description
          : null,
      coverImage:
        typeof formData.coverImage === "string" ? formData.coverImage : null,
      bannerImage:
        typeof formData.bannerImage === "string" ? formData.bannerImage : null,
      ctaLabel:
        typeof formData.ctaLabel === "string" ? formData.ctaLabel : null,
      metadataJson:
        formData.metadata && typeof formData.metadata === "object"
          ? (formData.metadata as Record<string, unknown>)
          : null,
      trustNotesJson:
        formData.trustNotes && typeof formData.trustNotes === "object"
          ? (formData.trustNotes as Record<string, unknown>)
          : null,
      isFeatured: formData.isFeatured === true ? true : false,
      featuredSortOrder:
        typeof formData.featuredSortOrder === "number"
          ? formData.featuredSortOrder
          : null,
    };

    const result = await db
      .insert(planPresentations)
      .values(presentationData)
      .onConflictDoUpdate({
        target: planPresentations.planId,
        set: {
          offeringType,
          title: presentationData.title,
          subtitle: presentationData.subtitle,
          description: presentationData.description,
          coverImage: presentationData.coverImage,
          bannerImage: presentationData.bannerImage,
          ctaLabel: presentationData.ctaLabel,
          metadataJson: presentationData.metadataJson,
          trustNotesJson: presentationData.trustNotesJson,
          isFeatured: presentationData.isFeatured,
          featuredSortOrder: presentationData.featuredSortOrder,
          updatedAt: new Date(),
        },
      })
      .returning({ id: planPresentations.id });

    const entityId = result[0]?.id ?? existing?.id ?? planId;

    // Audit log with diff
    if (existing) {
      const changes = computeChanges(
        { title: existing.title, offeringType: existing.offeringType, description: existing.description },
        { title: presentationData.title, offeringType, description: presentationData.description },
      );
      await writeAuditLog({
        actorType: "user",
        actorId: session.user.id,
        action: "update",
        entityType: "planPresentation",
        entityId,
        changes,
      });
    } else {
      await writeAuditLog({
        actorType: "user",
        actorId: session.user.id,
        action: "create",
        entityType: "planPresentation",
        entityId,
        metadata: { planId, title: presentationData.title, offeringType },
      });
    }

    revalidatePresentationPaths(planId);

    logger.info("presentation saved successfully", { planId });
    return { success: true };
  } catch (err) {
    logger.error("failed to save presentation", {
      planId,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save presentation",
    };
  }
}

/**
 * Publish a presentation by setting publishedAt to now.
 */
export async function publishPresentationAction(
  planId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("plan-presentation:publish");

    logger.info("publish presentation", { planId, userId: session.user.id });

    const existing = await db.query.planPresentations.findFirst({
      where: eq(planPresentations.planId, planId),
    });

    await db
      .update(planPresentations)
      .set({ publishedAt: new Date() })
      .where(eq(planPresentations.planId, planId));

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "publish",
      entityType: "planPresentation",
      entityId: existing?.id ?? planId,
    });

    revalidatePresentationPaths(planId);

    logger.info("presentation published successfully", { planId });
    return { success: true };
  } catch (err) {
    logger.error("failed to publish presentation", {
      planId,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to publish",
    };
  }
}

/**
 * Unpublish a presentation by clearing publishedAt.
 */
export async function unpublishPresentationAction(
  planId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireAdminAction("plan-presentation:unpublish");

    logger.info("unpublish presentation", { planId, userId: session.user.id });

    const existing = await db.query.planPresentations.findFirst({
      where: eq(planPresentations.planId, planId),
    });

    await db
      .update(planPresentations)
      .set({ publishedAt: null })
      .where(eq(planPresentations.planId, planId));

    await writeAuditLog({
      actorType: "user",
      actorId: session.user.id,
      action: "unpublish",
      entityType: "planPresentation",
      entityId: existing?.id ?? planId,
    });

    revalidatePresentationPaths(planId);

    logger.info("presentation unpublished successfully", { planId });
    return { success: true };
  } catch (err) {
    logger.error("failed to unpublish presentation", {
      planId,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to unpublish",
    };
  }
}
