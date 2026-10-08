import { auth } from "@/lib/auth";
import { requireAgent, hasAgentPermission } from "@/lib/agent-auth";
import { db } from "@/lib/db";
import {
  media,
  agentApiKeys,
  users,
  lessons,
  planContents,
  courses,
  plans,
  planPresentations,
  skillReleases,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createLogger } from "@/lib/logger";
import { assertSameOriginRequest } from "@/lib/request-guard";
import {
  assetPath,
  mediaContextCanBindToEntity,
  type MediaEntityType,
} from "@/lib/media-assets";
import { getStorageProvider, type StoredObjectMetadata } from "@/lib/storage";
import { withApiHandler } from "@/lib/api-route";
import { bindAndValidateDraftSkillArtifact } from "@/lib/services/skill-artifact-service";
import { domainFailureHttpStatus } from "@/lib/services/library-skill-information-domain";
import { uploadConfirmRequestSchema } from "@/lib/upload-types";

const logger = createLogger("upload-confirm");

async function resolveUploader(req: Request): Promise<{ uploaderId: string; agentPermissions: string[] | null }> {
  const session = await auth();
  if (session?.user?.id) {
    assertSameOriginRequest(req);
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true },
    });
    if (user?.role !== "admin") {
      throw new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return { uploaderId: session.user.id, agentPermissions: null };
  }

  const agentKey = await requireAgent(req, "media:write");
  const keyRecord = await db.query.agentApiKeys.findFirst({
    where: eq(agentApiKeys.id, agentKey.keyId),
    columns: { createdBy: true },
  });

  if (!keyRecord) {
    throw new Response(JSON.stringify({ error: "Agent key record not found" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { uploaderId: keyRecord.createdBy, agentPermissions: agentKey.permissions };
}

async function entityExists(entityType: MediaEntityType, entityId: string): Promise<boolean> {
  switch (entityType) {
    case "lesson":
      return !!(await db.query.lessons.findFirst({
        where: eq(lessons.id, entityId),
        columns: { id: true },
      }));
    case "planContent":
      return !!(await db.query.planContents.findFirst({
        where: eq(planContents.id, entityId),
        columns: { id: true },
      }));
    case "course":
      return !!(await db.query.courses.findFirst({
        where: eq(courses.id, entityId),
        columns: { id: true },
      }));
    case "plan":
      return !!(await db.query.plans.findFirst({
        where: eq(plans.id, entityId),
        columns: { id: true },
      }));
    case "planPresentation":
      return !!(await db.query.planPresentations.findFirst({
        where: eq(planPresentations.id, entityId),
        columns: { id: true },
      }));
    case "skillRelease":
      return !!(await db.query.skillReleases.findFirst({
        where: eq(skillReleases.id, entityId),
        columns: { id: true },
      }));
  }
}

async function verifyUploadedObject(record: typeof media.$inferSelect): Promise<Response | null> {
  let metadata: StoredObjectMetadata;
  const storage = getStorageProvider();

  try {
    metadata = await storage.head(record.storageKey);
  } catch (error) {
    logger.warn("Uploaded object missing during confirm", {
      mediaId: record.id,
      storageKey: record.storageKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Uploaded object not found" }, { status: 404 });
  }

  const normalizedContentType = metadata.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const expectedContentType = record.mimeType.toLowerCase();
  const valid =
    metadata.contentLength === record.fileSize &&
    normalizedContentType === expectedContentType;

  if (valid) return null;

  logger.warn("Uploaded object metadata mismatch", {
    mediaId: record.id,
    storageKey: record.storageKey,
    expectedSize: record.fileSize,
    actualSize: metadata.contentLength,
    expectedContentType,
    actualContentType: metadata.contentType,
  });

  await storage.delete(record.storageKey).catch((error) => {
    logger.error("Failed to delete rejected upload", {
      mediaId: record.id,
      storageKey: record.storageKey,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  await db
    .update(media)
    .set({ status: "deleted" })
    .where(eq(media.id, record.id));

  return Response.json({ error: "Uploaded object metadata mismatch" }, { status: 400 });
}

export const POST = withApiHandler(
  { logger, operation: "confirm upload", internalError: "Server error" },
  async (req): Promise<Response> => {
    const { uploaderId, agentPermissions } = await resolveUploader(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = uploadConfirmRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }

    const { storageKey, entityType, entityId, expectedEntityRevision } = parsed.data;
    if (entityType === "skillRelease" && agentPermissions !== null
      && !hasAgentPermission(agentPermissions, "skill:write")) {
      return Response.json({ error: "Insufficient permissions. Required: skill:write" }, { status: 403 });
    }

    const record = await db.query.media.findFirst({
      where: and(
        eq(media.storageKey, storageKey),
        eq(media.uploadedBy, uploaderId),
      ),
    });

    if (!record) {
      return Response.json({ error: "Media record not found" }, { status: 404 });
    }
    if (record.status === "deleted" || record.status === "orphaned") {
      return Response.json({ error: "Media record is no longer confirmable" }, { status: 404 });
    }

    if (!mediaContextCanBindToEntity(record.context, entityType)) {
      return Response.json({ error: "Media context cannot be bound to this entity type" }, { status: 400 });
    }

    if (entityType && entityId && !(await entityExists(entityType, entityId))) {
      return Response.json({ error: "Target entity not found" }, { status: 404 });
    }

    const requestedEntityType = entityType ?? null;
    const requestedEntityId = entityId ?? null;
    if (record.status === "confirmed") {
      if (record.entityType !== requestedEntityType || record.entityId !== requestedEntityId) {
        return Response.json({ error: "Media is already confirmed for another entity" }, { status: 409 });
      }
    } else {
      const objectError = await verifyUploadedObject(record);
      if (objectError) return objectError;

      const [confirmed] = await db
        .update(media)
        .set({
          status: "confirmed",
          confirmedAt: new Date(),
          entityType: requestedEntityType,
          entityId: requestedEntityId,
        })
        .where(and(eq(media.id, record.id), eq(media.status, "pending")))
        .returning({
          status: media.status,
          entityType: media.entityType,
          entityId: media.entityId,
        });
      if (!confirmed) {
        const current = await db.query.media.findFirst({ where: eq(media.id, record.id) });
        if (
          current?.status !== "confirmed"
          || current.entityType !== requestedEntityType
          || current.entityId !== requestedEntityId
        ) {
          return Response.json({ error: "Media confirmation lost a concurrent update" }, { status: 409 });
        }
      }
    }

    if (entityType === "skillRelease" && entityId && expectedEntityRevision) {
      const artifact = await bindAndValidateDraftSkillArtifact({
        releaseId: entityId,
        mediaId: record.id,
        expectedRevision: expectedEntityRevision,
      });
      if (!artifact.ok) {
        return Response.json({
          error: artifact.message,
          kind: artifact.kind,
          issues: artifact.issues ?? [],
        }, { status: domainFailureHttpStatus[artifact.kind] });
      }
    }

    logger.info("Upload confirmed", {
      mediaId: record.id,
      storageKey,
      entityType,
      entityId,
      userId: uploaderId,
    });

    return Response.json({
      success: true,
      mediaId: record.id,
      assetUrl: assetPath(record.id),
    });
  },
);
