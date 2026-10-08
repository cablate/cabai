import { auth } from "@/lib/auth";
import { requireAgent } from "@/lib/agent-auth";
import { getStorageProvider } from "@/lib/storage";
import {
  uploadSignedUrlRequestSchema,
  uploadSignedUrlResponseSchema,
  type UploadError,
} from "@/lib/upload-types";
import {
  validateFileMetadata,
  generateStorageKey,
} from "@/lib/upload-validation";
import { createLogger } from "@/lib/logger";
import { db } from "@/lib/db";
import { media, agentApiKeys, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { assertSameOriginRequest } from "@/lib/request-guard";
import { assetPath, isPrivateMediaContext } from "@/lib/media-assets";
import { getAppBaseUrl } from "@/lib/app-url";
import { withApiHandler } from "@/lib/api-route";
import { checkDistributedRateLimit } from "@/lib/distributed-rate-limit";

const logger = createLogger("upload");

const ADMIN_RATE_LIMIT_REQUESTS = 10;
const AGENT_RATE_LIMIT_REQUESTS = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
async function checkRateLimit(userId: string, actorId: string | null, isAgent: boolean) {
  const limit = isAgent ? AGENT_RATE_LIMIT_REQUESTS : ADMIN_RATE_LIMIT_REQUESTS;
  const bucketKey = isAgent ? `upload:agent:${actorId ?? userId}` : `upload:admin:${userId}`;
  return checkDistributedRateLimit({ key: bucketKey, limit, windowMs: RATE_LIMIT_WINDOW_MS });
}

async function resolveUploader(req: Request): Promise<{
  userId: string;
  actorId: string | null;
  isAgent: boolean;
}> {
  const session = await auth();
  if (session?.user?.id) {
    assertSameOriginRequest(req);
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { role: true },
    });

    if (user?.role !== "admin") {
      throw new Response(JSON.stringify({
        code: "UNAUTHORIZED",
        message: "Only admins can create upload URLs",
      } satisfies UploadError), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return { userId: session.user.id, actorId: null, isAgent: false };
  }

  const agentKey = await requireAgent(req, "media:write");
  const keyRecord = await db.query.agentApiKeys.findFirst({
    where: eq(agentApiKeys.id, agentKey.keyId),
    columns: { createdBy: true },
  });

  if (!keyRecord) {
    throw new Response(JSON.stringify({
      code: "SERVER_ERROR",
      message: "Agent key record not found",
    } satisfies UploadError), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { userId: keyRecord.createdBy, actorId: agentKey.agentId, isAgent: true };
}

export const POST = withApiHandler(
  { logger, operation: "upload", internalError: "Upload service error" },
  async (req): Promise<Response> => {
    try {
    const { userId, actorId, isAgent } = await resolveUploader(req);

    const rateLimit = await checkRateLimit(userId, actorId, isAgent);
    if (!rateLimit.allowed) {
      logger.warn("Upload rate limit exceeded", { userId, actorId });
      return Response.json(
        {
          code: "RATE_LIMIT",
          message: "Too many upload requests. Please wait before trying again.",
        } as UploadError,
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
            "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
          },
        },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        {
          code: "INVALID_FILE",
          message: "Invalid JSON body",
        } as UploadError,
        { status: 400 },
      );
    }

    const parseResult = uploadSignedUrlRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return Response.json(
        {
          code: "INVALID_FILE",
          message: "Invalid request",
          field: parseResult.error.errors[0]?.path.join("."),
        } as UploadError,
        { status: 400 },
      );
    }

    const { filename, contentType, fileSize, context } = parseResult.data;
    const validation = validateFileMetadata(
      filename,
      contentType,
      fileSize,
      context,
    );

    if (!validation.valid) {
      logger.warn("Upload validation failed", {
        userId,
        actorId,
        context,
        error: validation.error,
      });
      return Response.json(
        {
          code: "INVALID_TYPE",
          message: validation.error || "File validation failed",
        } as UploadError,
        { status: 400 },
      );
    }

    const storageKey = generateStorageKey(context, filename, userId);
    // F-33: shorter signed-URL TTL (15 min). See r2-client for rationale.
    const SIGNED_URL_TTL_SECONDS = 900;
    const storage = getStorageProvider();
    const signedUrl = await storage.createUploadTarget({
      key: storageKey,
      contentType,
      contentLength: fileSize,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });

    const mediaId = crypto.randomUUID();
    const objectPublicUrl = storage.publicUrl(storageKey);
    const publicUrl = isPrivateMediaContext(context)
      ? assetPath(mediaId)
      : objectPublicUrl;

    await db.insert(media).values({
      id: mediaId,
      storageKey,
      publicUrl,
      filename,
      mimeType: contentType,
      fileSize,
      context,
      uploadedBy: userId,
      status: "pending",
    });

    logger.info("Upload signed URL generated", {
      userId,
      actorId,
      context,
      mediaId,
      storageKey,
      fileSize,
      contentType,
    });

    const response = uploadSignedUrlResponseSchema.parse({
      signedUrl,
      mediaId,
      assetUrl: publicUrl,
      publicUrl,
      storageKey,
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });

    return Response.json(response, { status: 200 });
    } catch (error) {
      if (error instanceof Response) return error;

    logger.error("Upload endpoint error", {
      error: error instanceof Error ? error.message : String(error),
    });

      return Response.json(
        {
          code: "SERVER_ERROR",
          message: "Upload service error",
        } as UploadError,
        { status: 500 },
      );
    }
  },
);

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 200,
    headers: {
      // L-3: emit a canonical, validated origin (scheme+host, no path/trailing
      // slash) rather than echoing the raw env var. getAppBaseUrl() rejects
      // non-http(s) values and falls back safely, so a malformed
      // NEXT_PUBLIC_APP_URL can't produce a broken ACAO header.
      "Access-Control-Allow-Origin": getAppBaseUrl(),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Agent-Id",
    },
  });
}
