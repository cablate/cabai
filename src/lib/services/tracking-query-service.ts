import { createHash } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db";
import { eventsRaw, userDiscordLinks, users } from "@/lib/db/schema";

export const TRACKING_PAGE_SIZE = 20;
export const TRACKING_MAX_PAGE_SIZE = 50;

export type TrackingSort = "lastActiveAt" | "createdAt" | "eventCount";
export type TrackingSortDirection = "asc" | "desc";

export interface TrackingPageInput {
  search?: string;
  sort?: TrackingSort;
  direction?: TrackingSortDirection;
  cursor?: string;
  edge?: "first" | "last";
  pageSize?: number;
  /** Email is omitted by default; the current admin table opts in for its existing display. */
  includeEmail?: boolean;
  now?: Date;
}

export interface TrackingUserSummary {
  id: string;
  name: string | null;
  role: string;
  createdAt: string;
  lastActiveAt: string | null;
  latestEventType: string | null;
  latestEventTime: string | null;
  eventCount: number;
  discordLinked: boolean;
  discordEver: boolean;
  email?: string | null;
}

export interface TrackingPageResult {
  items: TrackingUserSummary[];
  pageSize: number;
  filteredCount: number;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  nextCursor: string | null;
  previousCursor: string | null;
  cursorApplied: boolean;
  observedAt: string;
}

interface TrackingCursor {
  version: 1;
  id: string;
  side: "after" | "before";
  sort: TrackingSort;
  direction: TrackingSortDirection;
  searchKey: string;
  value: string | number | null;
}

export function normalizeTrackingSearch(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "";
}

export function normalizeTrackingPageSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return TRACKING_PAGE_SIZE;
  return Math.max(1, Math.min(TRACKING_MAX_PAGE_SIZE, Math.floor(value!)));
}

function timestampToIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function makeSearchKey(search: string): string {
  return createHash("sha256").update(search.toLocaleLowerCase("en-US")).digest("hex").slice(0, 16);
}

function encodeCursor(cursor: TrackingCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(
  token: string | undefined,
  expected: Pick<TrackingCursor, "sort" | "direction" | "searchKey">,
): TrackingCursor | null {
  if (!token || token.length > 1024) return null;
  try {
    const value = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as Partial<TrackingCursor>;
    if (
      value.version !== 1
      || typeof value.id !== "string"
      || value.id.length === 0
      || (value.side !== "after" && value.side !== "before")
      || value.sort !== expected.sort
      || value.direction !== expected.direction
      || value.searchKey !== expected.searchKey
      || !(value.value === null || typeof value.value === "string" || typeof value.value === "number")
      || (value.sort === "lastActiveAt" && !(value.value === null || typeof value.value === "string"))
      || (value.sort === "createdAt" && typeof value.value !== "string")
      || (value.sort === "eventCount" && typeof value.value !== "number")
      || (typeof value.value === "number" && !Number.isFinite(value.value))
    ) {
      return null;
    }
    return value as TrackingCursor;
  } catch {
    return null;
  }
}

function cursorForRow(
  row: { id: string; lastActiveAt: Date | null; createdAt: Date; eventCount: number },
  side: TrackingCursor["side"],
  sort: TrackingSort,
  direction: TrackingSortDirection,
  searchKey: string,
): string {
  const value = sort === "lastActiveAt"
    ? row.lastActiveAt?.toISOString() ?? null
    : sort === "createdAt"
      ? row.createdAt.toISOString()
      : row.eventCount;
  return encodeCursor({ version: 1, id: row.id, side, sort, direction, searchKey, value });
}

function compareId(id: string, direction: TrackingSortDirection, side: TrackingCursor["side"]) {
  const isAfter = side === "after";
  const greater = (direction === "asc") === isAfter;
  return greater ? gt(users.id, id) : lt(users.id, id);
}

function cursorCondition(
  cursor: TrackingCursor,
  eventCountExpression: ReturnType<typeof sql<number>>,
) {
  const { direction, side, value } = cursor;
  const isAfter = side === "after";
  const valueGreater = (direction === "asc") === isAfter;
  const compareValue = valueGreater ? gt : lt;

  if (cursor.sort === "lastActiveAt") {
    const cursorDate = typeof value === "string" ? new Date(value) : null;
    if (cursorDate && !Number.isNaN(cursorDate.getTime())) {
      const rank = direction === "desc" ? 1 : 0;
      const rankCompare = isAfter ? gt : lt;
      return or(
        rankCompare(sql<number>`case when ${users.lastActiveAt} is null then ${direction === "desc" ? 0 : 1} else ${direction === "desc" ? 1 : 0} end`, rank),
        and(
          eq(sql<number>`case when ${users.lastActiveAt} is null then ${direction === "desc" ? 0 : 1} else ${direction === "desc" ? 1 : 0} end`, rank),
          or(
            compareValue(users.lastActiveAt, cursorDate),
            and(eq(users.lastActiveAt, cursorDate), compareId(cursor.id, direction, side)),
          ),
        ),
      );
    }

    const nullRank = direction === "desc" ? 0 : 1;
    const rankCompare = isAfter ? gt : lt;
    return or(
      rankCompare(sql<number>`case when ${users.lastActiveAt} is null then ${direction === "desc" ? 0 : 1} else ${direction === "desc" ? 1 : 0} end`, nullRank),
      and(
        eq(sql<number>`case when ${users.lastActiveAt} is null then ${direction === "desc" ? 0 : 1} else ${direction === "desc" ? 1 : 0} end`, nullRank),
        compareId(cursor.id, direction, side),
      ),
    );
  }

  if (cursor.sort === "createdAt" && typeof value === "string") {
    const cursorDate = new Date(value);
    if (Number.isNaN(cursorDate.getTime())) return undefined;
    return or(
      compareValue(users.createdAt, cursorDate),
      and(eq(users.createdAt, cursorDate), compareId(cursor.id, direction, side)),
    );
  }

  if (cursor.sort === "eventCount" && typeof value === "number") {
    return or(
      compareValue(eventCountExpression, value),
      and(eq(eventCountExpression, value), compareId(cursor.id, direction, side)),
    );
  }

  // A mismatched cursor cannot safely define a keyset boundary.
  return undefined;
}

function sortExpressions(
  sort: TrackingSort,
  direction: TrackingSortDirection,
  reverse: boolean,
  eventCountExpression: ReturnType<typeof sql<number>>,
) {
  const effectiveDirection = (direction === "asc") !== reverse ? "asc" : "desc";
  const ordered = effectiveDirection === "asc" ? asc : desc;
  if (sort === "lastActiveAt") {
    const nullRank = sql<number>`case when ${users.lastActiveAt} is null then ${direction === "desc" ? 0 : 1} else ${direction === "desc" ? 1 : 0} end`;
    return reverse
      ? [desc(nullRank), ordered(users.lastActiveAt), ordered(users.id)]
      : [asc(nullRank), ordered(users.lastActiveAt), ordered(users.id)];
  }
  const sortExpression = sort === "createdAt" ? users.createdAt : eventCountExpression;
  return [ordered(sortExpression), ordered(users.id)];
}

/**
 * Bounded admin projection for the Tracking list. It always makes two database
 * round-trips: one aggregate for counts, and one keyset query for the current page.
 */
export async function listTrackingPage(input: TrackingPageInput = {}): Promise<TrackingPageResult> {
  const search = normalizeTrackingSearch(input.search);
  const sort = input.sort ?? "lastActiveAt";
  const direction = input.direction ?? "desc";
  const pageSize = normalizeTrackingPageSize(input.pageSize);
  const observedAt = input.now ?? new Date();
  const cutoff = new Date(observedAt.getTime() - 7 * 24 * 60 * 60 * 1000);
  const searchKey = makeSearchKey(search);
  const cursor = decodeCursor(input.cursor, { sort, direction, searchKey });
  const searchPattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const searchCondition = search
    ? or(ilike(users.name, searchPattern), ilike(users.email, searchPattern))
    : undefined;

  const [counts] = await db
    .select({
      totalUsers: count(users.id),
      activeUsers: sql<number>`count(*) filter (where ${users.lastActiveAt} is not null)`,
      inactiveUsers: sql<number>`count(*) filter (where ${users.lastActiveAt} is null or ${users.lastActiveAt} < ${cutoff})`,
      filteredCount: sql<number>`count(*) filter (where ${searchCondition ?? sql`true`})`,
    })
    .from(users);

  const eventCountExpression = sql<number>`(select count(*)::int from ${eventsRaw} where ${eventsRaw.userId} = ${users.id})`;
  const pageCondition = and(searchCondition, cursor ? cursorCondition(cursor, eventCountExpression) : undefined);
  const beforeCursor = cursor?.side === "before" || (!cursor && input.edge === "last");
  const baseSelection = {
    id: users.id,
    name: users.name,
    role: users.role,
    createdAt: users.createdAt,
    lastActiveAt: users.lastActiveAt,
    latestEventType: sql<string | null>`(select ${eventsRaw.eventType} from ${eventsRaw} where ${eventsRaw.userId} = ${users.id} order by ${eventsRaw.createdAt} desc, ${eventsRaw.id} desc limit 1)`,
    latestEventTime: sql<Date | null>`(select ${eventsRaw.createdAt} from ${eventsRaw} where ${eventsRaw.userId} = ${users.id} order by ${eventsRaw.createdAt} desc, ${eventsRaw.id} desc limit 1)`,
    eventCount: eventCountExpression,
    discordLinkId: userDiscordLinks.id,
    discordUnlinkedAt: userDiscordLinks.unlinkedAt,
  };
  const selectedRows = input.includeEmail
    ? await db
        .select({ ...baseSelection, email: users.email })
        .from(users)
        .leftJoin(userDiscordLinks, eq(userDiscordLinks.userId, users.id))
        .where(pageCondition)
        .orderBy(...sortExpressions(sort, direction, beforeCursor, eventCountExpression))
        .limit(pageSize + 1)
    : await db
        .select(baseSelection)
        .from(users)
        .leftJoin(userDiscordLinks, eq(userDiscordLinks.userId, users.id))
        .where(pageCondition)
        .orderBy(...sortExpressions(sort, direction, beforeCursor, eventCountExpression))
        .limit(pageSize + 1);

  const hasExtraRow = selectedRows.length > pageSize;
  const rows = selectedRows.slice(0, pageSize);
  if (beforeCursor) rows.reverse();

  const isLastEdge = !cursor && input.edge === "last";
  const hasPrevious = beforeCursor ? hasExtraRow : Boolean(cursor);
  const hasNext = isLastEdge
    ? false
    : cursor
      ? beforeCursor || hasExtraRow
      : hasExtraRow;
  const first = rows[0];
  const last = rows.at(-1);
  const includeEmail = input.includeEmail === true;
  const items: TrackingUserSummary[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    latestEventType: row.latestEventType,
    latestEventTime: timestampToIso(row.latestEventTime as Date | string | null),
    eventCount: Number(row.eventCount ?? 0),
    discordLinked: Boolean(row.discordLinkId && row.discordUnlinkedAt === null),
    discordEver: row.discordLinkId !== null,
    ...(includeEmail ? { email: ("email" in row ? row.email : null) as string | null } : {}),
  }));

  return {
    items,
    pageSize,
    filteredCount: Number(counts?.filteredCount ?? 0),
    totalUsers: Number(counts?.totalUsers ?? 0),
    activeUsers: Number(counts?.activeUsers ?? 0),
    inactiveUsers: Number(counts?.inactiveUsers ?? 0),
    nextCursor: hasNext && last
      ? cursorForRow(last, "after", sort, direction, searchKey)
      : null,
    previousCursor: hasPrevious && first
      ? cursorForRow(first, "before", sort, direction, searchKey)
      : null,
    cursorApplied: cursor !== null,
    observedAt: observedAt.toISOString(),
  };
}
