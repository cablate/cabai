import { and, desc, eq, gt, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { checkCourseAccess } from "@/lib/course-access";
import { db } from "@/lib/db";
import { agentInformationItems, userAgentInformationReads } from "@/lib/db/schema";
import { domainFailure, domainSuccess, type DomainResult } from "./library-skill-information-domain";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_ACK = 100;

type CursorPayload = { publishedAt: string; id: string };

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): DomainResult<CursorPayload | null> {
  if (!value) return domainSuccess(null);
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (typeof parsed.id !== "string" || typeof parsed.publishedAt !== "string" || Number.isNaN(Date.parse(parsed.publishedAt))) {
      return domainFailure("validation-failed", "Cursor is invalid");
    }
    return domainSuccess({ id: parsed.id, publishedAt: parsed.publishedAt });
  } catch {
    return domainFailure("validation-failed", "Cursor is invalid");
  }
}

async function isVisibleToUser(userId: string, item: typeof agentInformationItems.$inferSelect): Promise<boolean> {
  if (item.status !== "published" || !item.publishedAt) return false;
  if (item.expiresAt && item.expiresAt <= new Date()) return false;
  if (item.audience === "all_users") return true;
  if (item.sourceType !== "course") return false;
  return (await checkCourseAccess(item.sourceId, userId)).hasAccess;
}

export interface UserInformationSummary {
  id: string;
  kind: string;
  title: string;
  summary: string;
  whyItMatters: string;
  publishedAt: Date;
  expiresAt: Date | null;
  tags: string[];
}

export interface UserInformationDetail extends UserInformationSummary {
  bodyMarkdown: string;
  actions: typeof agentInformationItems.$inferSelect.actions;
}

export type UserInformationProjection = UserInformationDetail;

export type UserInformationInclude = "full" | "summary";

function toUserInformationSummary(item: typeof agentInformationItems.$inferSelect): UserInformationSummary {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    whyItMatters: item.whyItMatters,
    publishedAt: item.publishedAt!,
    expiresAt: item.expiresAt,
    tags: item.tags,
  };
}

function toUserInformationDetail(item: typeof agentInformationItems.$inferSelect): UserInformationDetail {
  return {
    ...toUserInformationSummary(item),
    bodyMarkdown: item.bodyMarkdown,
    actions: item.actions,
  };
}

function projectUserInformation(
  item: typeof agentInformationItems.$inferSelect,
  include: UserInformationInclude = "full",
): UserInformationSummary | UserInformationDetail {
  return include === "summary" ? toUserInformationSummary(item) : toUserInformationDetail(item);
}

export async function listUnreadInformation(input: {
  userId: string;
  cursor?: string;
  limit?: number;
  include?: UserInformationInclude;
}): Promise<DomainResult<{ items: Array<UserInformationSummary | UserInformationDetail>; nextCursor: string | null }>> {
  const cursor = decodeCursor(input.cursor);
  if (!cursor.ok) return cursor;
  const limit = Math.max(1, Math.min(MAX_LIMIT, input.limit ?? DEFAULT_LIMIT));
  const now = new Date();
  const batchSize = Math.max(50, Math.min(200, limit * 2));
  const maxScanned = 1000;
  const visible: Array<typeof agentInformationItems.$inferSelect> = [];
  let scanCursor = cursor.value;
  let scanned = 0;
  let exhausted = false;

  while (visible.length <= limit && scanned < maxScanned && !exhausted) {
    const scanDate = scanCursor ? new Date(scanCursor.publishedAt) : null;
    const rows = await db.select().from(agentInformationItems).where(and(
      eq(agentInformationItems.status, "published"),
      or(isNull(agentInformationItems.expiresAt), gt(agentInformationItems.expiresAt, now)),
      notExists(
        db.select({ value: sql`1` }).from(userAgentInformationReads).where(and(
          eq(userAgentInformationReads.userId, input.userId),
          eq(userAgentInformationReads.informationId, agentInformationItems.id),
        )),
      ),
      scanCursor && scanDate
        ? or(
            lt(agentInformationItems.publishedAt, scanDate),
            and(eq(agentInformationItems.publishedAt, scanDate), lt(agentInformationItems.id, scanCursor.id)),
          )
        : undefined,
    )).orderBy(desc(agentInformationItems.publishedAt), desc(agentInformationItems.id)).limit(batchSize);

    exhausted = rows.length < batchSize;
    for (const row of rows) {
      scanned += 1;
      if (await isVisibleToUser(input.userId, row)) visible.push(row);
      scanCursor = row.publishedAt
        ? { publishedAt: row.publishedAt.toISOString(), id: row.id }
        : scanCursor;
      if (visible.length > limit || scanned >= maxScanned) break;
    }
  }
  const page = visible.slice(0, limit);
  const last = page.at(-1);
  const moreVisible = visible.length > limit;
  const scanLimited = !exhausted && scanned >= maxScanned;
  return domainSuccess({
    items: page.map((item) => projectUserInformation(item, input.include)),
    nextCursor: moreVisible && last?.publishedAt
      ? encodeCursor({ publishedAt: last.publishedAt.toISOString(), id: last.id })
      : scanLimited && scanCursor
        ? encodeCursor(scanCursor)
        : null,
  });
}

export async function getVisibleInformation(input: {
  userId: string;
  informationId: string;
}): Promise<DomainResult<UserInformationDetail>> {
  const item = await db.query.agentInformationItems.findFirst({
    where: eq(agentInformationItems.id, input.informationId),
  });
  if (!item) return domainFailure("not-found", `Information ${input.informationId} not found`);
  if (!await isVisibleToUser(input.userId, item)) {
    return domainFailure("forbidden", `Information ${input.informationId} is not visible to this user`);
  }
  return domainSuccess(toUserInformationDetail(item));
}

export async function acknowledgeInformation(input: {
  userId: string;
  informationIds: string[];
}): Promise<DomainResult<{ acknowledged: string[] }>> {
  const informationIds = [...new Set(input.informationIds)];
  if (informationIds.length === 0 || informationIds.length > MAX_ACK) {
    return domainFailure("validation-failed", `ACK requires between 1 and ${MAX_ACK} unique Information IDs`);
  }

  const rows = await Promise.all(informationIds.map((id) => (
    db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, id) })
  )));
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) return domainFailure("not-found", `Information ${informationIds[index]} not found`);
    if (!await isVisibleToUser(input.userId, row)) {
      return domainFailure("forbidden", `Information ${informationIds[index]} is not visible to this user`);
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(userAgentInformationReads).values(informationIds.map((informationId) => ({
      userId: input.userId,
      informationId,
    }))).onConflictDoNothing();
  });
  return domainSuccess({ acknowledged: informationIds });
}
