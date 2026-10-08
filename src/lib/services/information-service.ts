import { and, asc, count, desc, eq, gt, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { informationAuthorInputSchema, informationPatchSchema } from "@/lib/agent/information-schemas";
import { resolveInformationActionOperation, validateActionParameters } from "@/lib/agent/action-resolver";
import { listLocallyEligibleUserIdsForCourse } from "@/lib/course-access";
import { db } from "@/lib/db";
import {
  agentInformationEvents,
  agentInformationItems,
  libraryEntries,
  skillReleases,
  userAgentInformationReads,
  users,
  type AgentInformationAction,
} from "@/lib/db/schema";
import {
  buildInformationSourceBundle,
  hasPublishedInformationForDedupeKey,
  validateInformationKindSource,
  type InformationSourceBundle,
  type InformationSourceType,
} from "@/lib/information-sources";
import {
  canTransition,
  domainFailure,
  domainSuccess,
  readinessResult,
  type DomainActor,
  type DomainResult,
  type InformationKind,
  type ReadinessIssue,
  type ReadinessResult,
} from "./library-skill-information-domain";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const secretPatterns = [
  /\bcab_(?:agent|user)_[A-Za-z0-9_-]{12,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/,
];

function containsPossibleSecret(value: string): boolean {
  return secretPatterns.some((pattern) => pattern.test(value));
}

function dedupeKey(bundle: InformationSourceBundle, kind: InformationKind): string {
  return [bundle.sourceType, bundle.sourceId, bundle.sourceVersion, kind].join(":");
}

function selectActions(
  bundle: InformationSourceBundle,
  selections: Array<{ rel: string }>,
): DomainResult<AgentInformationAction[]> {
  const byRel = new Map(bundle.actionTemplates.map((action) => [action.rel, action]));
  const actions: AgentInformationAction[] = [];
  for (const selection of selections) {
    const action = byRel.get(selection.rel);
    if (!action) return domainFailure("validation-failed", `Action ${selection.rel} is not allowed by the source bundle`, {
      issues: [{ code: "action_tampered", field: "actionSelections", severity: "error", message: `Action ${selection.rel} is not allowed` }],
    });
    actions.push(action);
  }
  return domainSuccess(actions);
}

function actionsMatch(left: AgentInformationAction, right: AgentInformationAction): boolean {
  if (
    left.rel !== right.rel
    || left.operationId !== right.operationId
    || left.credential !== right.credential
  ) return false;
  const leftKeys = Object.keys(left.parameters).sort();
  const rightKeys = Object.keys(right.parameters).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index] && left.parameters[key] === right.parameters[key]
    ));
}

function buildBundleForInformation(sourceType: InformationSourceType, sourceId: string, kind: InformationKind) {
  return sourceType === "course"
    ? buildInformationSourceBundle(sourceType, sourceId, { kind })
    : buildInformationSourceBundle(sourceType, sourceId);
}

export async function createInformationDraftFromSource(input: {
  sourceType: InformationSourceType;
  sourceId?: string;
  author: unknown;
  resourceId?: string;
}): Promise<DomainResult<typeof agentInformationItems.$inferSelect>> {
  const parsed = informationAuthorInputSchema.safeParse(input.author);
  if (!parsed.success) return domainFailure("validation-failed", "Information author input is invalid", {
    issues: [{ code: "invalid_format", field: "author", severity: "error", message: parsed.error.message }],
  });
  const sourceId = input.sourceType === "manual_announcement"
    ? input.sourceId ?? input.resourceId ?? crypto.randomUUID()
    : input.sourceId;
  if (!sourceId) return domainFailure("validation-failed", "A source ID is required for source-backed Information");
  const source = await buildBundleForInformation(input.sourceType, sourceId, parsed.data.kind);
  if (!source.ok) return source;
  if (!validateInformationKindSource(parsed.data.kind, source.value.sourceType) || !source.value.allowedKinds.includes(parsed.data.kind)) {
    return domainFailure("validation-failed", "Information kind is not compatible with its source", {
      issues: [{ code: "invalid_materiality", field: "kind", severity: "error", message: "Kind is not allowed for this source" }],
    });
  }
  const selected = selectActions(source.value, parsed.data.actionSelections);
  if (!selected.ok) return selected;

  try {
    const [row] = await db.insert(agentInformationItems).values({
      ...(input.resourceId ? { id: input.resourceId } : {}),
      dedupeKey: dedupeKey(source.value, parsed.data.kind),
      sourceType: source.value.sourceType,
      sourceId: source.value.sourceId,
      sourceVersion: source.value.sourceVersion,
      kind: parsed.data.kind,
      title: parsed.data.title,
      summary: parsed.data.summary,
      whyItMatters: parsed.data.whyItMatters,
      bodyMarkdown: parsed.data.bodyMarkdown,
      audience: source.value.audience,
      actions: selected.value,
      tags: parsed.data.tags,
      expiresAt: parsed.data.expiresAt,
    }).returning();
    return row ? domainSuccess(row) : domainFailure("conflict", "Information draft was not created");
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return domainFailure("conflict", "Information with the same source version and kind already exists");
    }
    throw error;
  }
}

export async function updateInformationDraft(
  informationId: string,
  input: unknown,
): Promise<DomainResult<typeof agentInformationItems.$inferSelect>> {
  const parsed = informationPatchSchema.safeParse(input);
  if (!parsed.success) return domainFailure("validation-failed", "Information patch is invalid", {
    issues: [{ code: "invalid_format", field: "patch", severity: "error", message: parsed.error.message }],
  });
  const current = await db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, informationId) });
  if (!current) return domainFailure("not-found", "Information not found");
  if (current.status !== "draft") return domainFailure("immutable", "Published or withdrawn Information cannot be edited in place");

  let actions = current.actions;
  if (parsed.data.actionSelections) {
    const source = await buildBundleForInformation(current.sourceType, current.sourceId, current.kind as InformationKind);
    if (!source.ok) return source;
    const selected = selectActions(source.value, parsed.data.actionSelections);
    if (!selected.ok) return selected;
    actions = selected.value;
  }

  const [row] = await db.update(agentInformationItems).set({
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.summary !== undefined ? { summary: parsed.data.summary } : {}),
    ...(parsed.data.whyItMatters !== undefined ? { whyItMatters: parsed.data.whyItMatters } : {}),
    ...(parsed.data.bodyMarkdown !== undefined ? { bodyMarkdown: parsed.data.bodyMarkdown } : {}),
    ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
    ...(parsed.data.expiresAt !== undefined ? { expiresAt: parsed.data.expiresAt } : {}),
    actions,
    revision: sql`${agentInformationItems.revision} + 1`,
    updatedAt: new Date(),
  }).where(and(
    eq(agentInformationItems.id, informationId),
    eq(agentInformationItems.status, "draft"),
    eq(agentInformationItems.revision, parsed.data.expectedRevision),
  )).returning();
  return row ? domainSuccess(row) : domainFailure("stale-revision", "Information revision is stale");
}

export async function validateInformationReadiness(
  informationId: string,
  options: {
    allowBundleSource?: { sourceType: string; sourceId: string };
    deferSourceVersionCheck?: boolean;
  } = {},
): Promise<DomainResult<ReadinessResult>> {
  const item = await db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, informationId) });
  if (!item) return domainFailure("not-found", "Information not found");
  const issues: ReadinessIssue[] = [];
  const source = await buildBundleForInformation(item.sourceType, item.sourceId, item.kind as InformationKind);
  if (!source.ok) {
    issues.push({ code: "stale_source", field: "source", severity: "error", message: source.message });
    return domainSuccess(readinessResult(issues));
  }
  issues.push(...source.value.issues);
  const bundleSourceAllowed = options.allowBundleSource?.sourceType === item.sourceType
    && options.allowBundleSource.sourceId === item.sourceId;
  if (source.value.requiresBundlePublish && !bundleSourceAllowed) {
    issues.push({
      code: "stale_source",
      field: "source.status",
      severity: "error",
      message: "Draft source and Information must be published by their domain bundle coordinator",
    });
  }
  const publishedLibraryAnnouncement = item.status === "published" && item.sourceType === "library_entry";
  if (!options.deferSourceVersionCheck && !publishedLibraryAnnouncement && source.value.sourceVersion !== item.sourceVersion) {
    issues.push({ code: "stale_source", field: "sourceVersion", severity: "error", message: "Source version changed after this draft was created" });
  }
  if (!validateInformationKindSource(item.kind as InformationKind, item.sourceType) || !source.value.allowedKinds.includes(item.kind as InformationKind)) {
    issues.push({ code: "invalid_materiality", field: "kind", severity: "error", message: "Kind is not compatible with the current source" });
  }
  if (item.audience !== source.value.audience || (item.audience === "source_entitled" && item.sourceType !== "course")) {
    issues.push({ code: "invalid_audience", field: "audience", severity: "error", message: "Audience is not allowed for this source" });
  }
  if (!item.title.trim()) issues.push({ code: "required", field: "title", severity: "error", message: "Title is required" });
  if (!item.summary.trim()) issues.push({ code: "required", field: "summary", severity: "error", message: "Summary is required" });
  if (containsPossibleSecret(`${item.title}\n${item.summary}\n${item.whyItMatters}\n${item.bodyMarkdown}`)) {
    issues.push({ code: "possible_secret", field: "content", severity: "error", message: "Information may contain a credential or private key" });
  }
  if (item.expiresAt && item.expiresAt <= new Date()) {
    issues.push({ code: "invalid_format", field: "expiresAt", severity: "error", message: "Expiration must be in the future when publishing" });
  }
  if (item.actions.length === 0 && source.value.requiresAction !== false) {
    issues.push({ code: "broken_action", field: "actions", severity: "error", message: "At least one current Domain API action is required" });
  }
  if (item.kind === "course.announced" && source.value.sourceStatus !== "published") {
    issues.push({ code: "stale_source", field: "source.status", severity: "error", message: "A public course announcement requires a published course" });
  }
  for (const [index, action] of item.actions.entries()) {
    const operation = resolveInformationActionOperation(action.operationId);
    const allowed = source.value.actionTemplates.find((template) => template.rel === action.rel);
    if (!operation || !allowed) {
      issues.push({ code: "broken_action", field: `actions.${index}`, severity: "error", message: "Action operation is missing or no longer allowed" });
      continue;
    }
    if (!actionsMatch(action, allowed) || !validateActionParameters(operation, action.parameters)) {
      issues.push({ code: "action_tampered", field: `actions.${index}`, severity: "error", message: "Action differs from the server source bundle" });
    }
  }
  if (await hasPublishedInformationForDedupeKey(item.dedupeKey, item.id)) {
    issues.push({ code: "duplicate_information", field: "dedupeKey", severity: "error", message: "A published Information item already owns this dedupe key" });
  }
  return domainSuccess(readinessResult(issues));
}

async function transitionInformationInTransaction(
  tx: DbTransaction,
  input: {
    informationId: string;
    expectedRevision: number;
    toStatus: "published" | "withdrawn";
    actor: DomainActor;
    idempotencyKey: string;
    now: Date;
  },
): Promise<DomainResult<typeof agentInformationItems.$inferSelect>> {
  await tx.execute(sql`select ${agentInformationItems.id} from ${agentInformationItems} where ${agentInformationItems.id} = ${input.informationId} for update`);
  const existingEvent = await tx.query.agentInformationEvents.findFirst({
    where: eq(agentInformationEvents.idempotencyKey, input.idempotencyKey),
  });
  if (existingEvent) {
    if (existingEvent.informationId !== input.informationId || existingEvent.toStatus !== input.toStatus) {
      return domainFailure("conflict", "Idempotency key was already used for a different transition");
    }
    const existing = await tx.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, input.informationId) });
    return existing ? domainSuccess(existing) : domainFailure("not-found", "Information not found");
  }

  const current = await tx.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, input.informationId) });
  if (!current) return domainFailure("not-found", "Information not found");
  if (!canTransition("information", current.status, input.toStatus)) {
    return domainFailure("invalid-transition", `Cannot transition Information from ${current.status} to ${input.toStatus}`);
  }
  const nextRevision = current.revision + 1;
  const [updated] = await tx.update(agentInformationItems).set({
    status: input.toStatus,
    revision: nextRevision,
    publishedAt: input.toStatus === "published" ? input.now : current.publishedAt,
    withdrawnAt: input.toStatus === "withdrawn" ? input.now : null,
    updatedAt: input.now,
  }).where(and(
    eq(agentInformationItems.id, input.informationId),
    eq(agentInformationItems.status, current.status),
    eq(agentInformationItems.revision, input.expectedRevision),
  )).returning();
  if (!updated) return domainFailure("stale-revision", "Information revision is stale");
  await tx.insert(agentInformationEvents).values({
    informationId: input.informationId,
    idempotencyKey: input.idempotencyKey,
    fromStatus: current.status,
    toStatus: input.toStatus,
    actorType: input.actor.type,
    actorId: input.actor.id,
    revision: nextRevision,
    createdAt: input.now,
  });
  return domainSuccess(updated);
}

export { transitionInformationInTransaction };

export async function publishInformation(input: {
  informationId: string;
  expectedRevision: number;
  actor: DomainActor;
  idempotencyKey: string;
}): Promise<DomainResult<typeof agentInformationItems.$inferSelect>> {
  const readiness = await validateInformationReadiness(input.informationId);
  if (!readiness.ok) return readiness;
  if (!readiness.value.ready) return domainFailure("validation-failed", "Information is not ready to publish", { issues: readiness.value.issues });
  return db.transaction((tx) => transitionInformationInTransaction(tx, { ...input, toStatus: "published", now: new Date() }));
}

export async function withdrawInformation(input: {
  informationId: string;
  expectedRevision: number;
  actor: DomainActor;
  idempotencyKey: string;
}): Promise<DomainResult<typeof agentInformationItems.$inferSelect>> {
  return db.transaction((tx) => transitionInformationInTransaction(tx, { ...input, toStatus: "withdrawn", now: new Date() }));
}

export async function getInformationHistory(informationId: string) {
  return db.select().from(agentInformationEvents)
    .where(eq(agentInformationEvents.informationId, informationId))
    .orderBy(desc(agentInformationEvents.createdAt), desc(agentInformationEvents.id));
}

export async function getInformation(informationId: string): Promise<DomainResult<typeof agentInformationItems.$inferSelect>> {
  try {
    const item = await db.query.agentInformationItems.findFirst({ where: eq(agentInformationItems.id, informationId) });
    return item ? domainSuccess(item) : domainFailure("not-found", "Information not found");
  } catch {
    return domainFailure("prerequisite-unavailable", "Information persistence is unavailable", { retryable: true });
  }
}

export async function listInformation(filters: {
  status?: "draft" | "published" | "withdrawn";
  sourceType?: "manual_announcement" | "library_entry" | "skill_release" | "course" | "api_operation";
  sourceId?: string;
} = {}): Promise<DomainResult<Array<typeof agentInformationItems.$inferSelect>>> {
  try {
    const conditions = [
      filters.status ? eq(agentInformationItems.status, filters.status) : undefined,
      filters.sourceType ? eq(agentInformationItems.sourceType, filters.sourceType) : undefined,
      filters.sourceId ? eq(agentInformationItems.sourceId, filters.sourceId) : undefined,
    ].filter((condition): condition is Exclude<typeof condition, undefined> => condition !== undefined);
    const rows = await db.select().from(agentInformationItems)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(agentInformationItems.updatedAt), desc(agentInformationItems.id));
    return domainSuccess(rows);
  } catch {
    return domainFailure("prerequisite-unavailable", "Information persistence is unavailable", { retryable: true });
  }
}

export const ADMIN_INFORMATION_PAGE_SIZE = 20;

export type AdminInformationListView = "active" | "history" | "all";
export type AdminInformationListSort = "updated_desc" | "updated_asc" | "published_desc";

export interface AdminInformationListFilters {
  query?: string;
  view?: AdminInformationListView;
  status?: "draft" | "published" | "withdrawn";
  sourceType?: InformationSourceType;
  audience?: "all_users" | "source_entitled";
  sort?: AdminInformationListSort;
  page?: number;
}

export interface AdminInformationListPage {
  items: Array<typeof agentInformationItems.$inferSelect>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/**
 * Paginated read model for the human admin workspace.
 *
 * Keep this separate from listInformation(): that function is also the
 * existing Admin Agent API projection and intentionally retains its array
 * response contract.
 */
export async function listAdminInformationPage(
  filters: AdminInformationListFilters = {},
  now = new Date(),
): Promise<DomainResult<AdminInformationListPage>> {
  try {
    const view = filters.view ?? "active";
    const conditions: SQL[] = [];

    if (view === "active") {
      const active = or(
        eq(agentInformationItems.status, "draft"),
        and(
          eq(agentInformationItems.status, "published"),
          or(isNull(agentInformationItems.expiresAt), gt(agentInformationItems.expiresAt, now)),
        ),
      );
      if (active) conditions.push(active);
    } else if (view === "history") {
      const history = or(
        eq(agentInformationItems.status, "withdrawn"),
        and(
          eq(agentInformationItems.status, "published"),
          lte(agentInformationItems.expiresAt, now),
        ),
      );
      if (history) conditions.push(history);
    }

    if (filters.status) conditions.push(eq(agentInformationItems.status, filters.status));
    if (filters.sourceType) conditions.push(eq(agentInformationItems.sourceType, filters.sourceType));
    if (filters.audience) conditions.push(eq(agentInformationItems.audience, filters.audience));

    const query = filters.query?.trim();
    if (query) {
      const pattern = `%${query}%`;
      const search = or(
        ilike(agentInformationItems.title, pattern),
        ilike(agentInformationItems.summary, pattern),
        ilike(agentInformationItems.sourceId, pattern),
        ilike(agentInformationItems.kind, pattern),
      );
      if (search) conditions.push(search);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const countRows = await db
      .select({ value: count() })
      .from(agentInformationItems)
      .where(where);
    const totalItems = countRows[0]?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_INFORMATION_PAGE_SIZE));
    const requestedPage = Number.isInteger(filters.page) && (filters.page ?? 0) > 0 ? filters.page! : 1;
    const page = Math.min(requestedPage, totalPages);

    const orderBy = filters.sort === "updated_asc"
      ? [asc(agentInformationItems.updatedAt), asc(agentInformationItems.id)]
      : filters.sort === "published_desc"
        ? [sql`${agentInformationItems.publishedAt} desc nulls last`, desc(agentInformationItems.id)]
        : [desc(agentInformationItems.updatedAt), desc(agentInformationItems.id)];

    const items = await db
      .select()
      .from(agentInformationItems)
      .where(where)
      .orderBy(...orderBy)
      .limit(ADMIN_INFORMATION_PAGE_SIZE)
      .offset((page - 1) * ADMIN_INFORMATION_PAGE_SIZE);

    return domainSuccess({
      items,
      page,
      pageSize: ADMIN_INFORMATION_PAGE_SIZE,
      totalItems,
      totalPages,
    });
  } catch {
    return domainFailure("prerequisite-unavailable", "Information persistence is unavailable", { retryable: true });
  }
}

export type PublicInformationItem = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  whyItMatters: string;
  bodyMarkdown: string;
  tags: string[];
  publishedAt: Date;
  href: string | null;
};

function publicInformationHref(actions: AgentInformationAction[]): string | null {
  const action = actions.find((candidate) => candidate.credential === "none");
  if (!action) return null;

  const idOrSlug = action.parameters.idOrSlug;
  if (typeof idOrSlug !== "string" || !idOrSlug) return null;

  if (action.rel === "library-entry") return `/library/${encodeURIComponent(idOrSlug)}`;
  if (action.rel === "skill-release") return `/skills/${encodeURIComponent(idOrSlug)}`;
  return null;
}

/** Public website projection. It does not expose Agent API actions or entitled-only content. */
export async function listPublishedPublicInformation(
  now = new Date(),
): Promise<DomainResult<PublicInformationItem[]>> {
  try {
    const rows = await db.select({
      id: agentInformationItems.id,
      kind: agentInformationItems.kind,
      title: agentInformationItems.title,
      summary: agentInformationItems.summary,
      whyItMatters: agentInformationItems.whyItMatters,
      bodyMarkdown: agentInformationItems.bodyMarkdown,
      tags: agentInformationItems.tags,
      publishedAt: agentInformationItems.publishedAt,
      expiresAt: agentInformationItems.expiresAt,
      actions: agentInformationItems.actions,
    }).from(agentInformationItems).where(and(
      eq(agentInformationItems.status, "published"),
      eq(agentInformationItems.audience, "all_users"),
      or(isNull(agentInformationItems.expiresAt), gt(agentInformationItems.expiresAt, now)),
    )).orderBy(desc(agentInformationItems.publishedAt), desc(agentInformationItems.id));

    return domainSuccess(rows.flatMap((row) => {
      if (!row.publishedAt) return [];
      return [{
        id: row.id,
        kind: row.kind,
        title: row.title,
        summary: row.summary,
        whyItMatters: row.whyItMatters,
        bodyMarkdown: row.bodyMarkdown,
        tags: row.tags,
        publishedAt: row.publishedAt,
        href: publicInformationHref(row.actions),
      }];
    }));
  } catch {
    return domainFailure("prerequisite-unavailable", "Information persistence is unavailable", { retryable: true });
  }
}

export async function getInformationStats(
  informationId: string,
  now = new Date(),
): Promise<DomainResult<{ eligible: number; read: number; unread: number; calculatedAt: Date }>> {
  try {
    const item = await db.query.agentInformationItems.findFirst({
      where: eq(agentInformationItems.id, informationId),
    });
    if (!item) return domainFailure("not-found", "Information not found");

    const [eligibleUserIds, reads] = await Promise.all([
      item.audience === "all_users"
        ? db.select({ id: users.id }).from(users).then((rows) => rows.map((user) => user.id))
        : item.sourceType === "course"
          ? listLocallyEligibleUserIdsForCourse(item.sourceId, now)
          : Promise.resolve([]),
      db.select({ userId: userAgentInformationReads.userId })
        .from(userAgentInformationReads)
        .where(eq(userAgentInformationReads.informationId, informationId)),
    ]);
    const readUserIds = new Set(reads.map((read) => read.userId));

    const read = eligibleUserIds.filter((userId) => readUserIds.has(userId)).length;
    return domainSuccess({
      eligible: eligibleUserIds.length,
      read,
      unread: eligibleUserIds.length - read,
      calculatedAt: now,
    });
  } catch {
    return domainFailure("prerequisite-unavailable", "Information statistics could not be calculated", { retryable: true });
  }
}

export type InformationCoverageCode =
  | "missing_information"
  | "broken_action"
  | "stale_source"
  | "duplicate_information"
  | "stuck_draft"
  | "missing_artifact"
  | "checksum_mismatch"
  | "withdrawn_source_active_information";

export interface InformationCoverageIssue {
  code: InformationCoverageCode;
  owner: "library" | "skill" | "course" | "api" | "information";
  sourceType: string;
  sourceId: string;
  informationId?: string;
  message: string;
}

export async function getInformationCoverage(
  now = new Date(),
): Promise<DomainResult<{ calculatedAt: Date; issues: InformationCoverageIssue[] }>> {
  try {
    const [items, publishedLibrary, publishedReleases] = await Promise.all([
      db.select().from(agentInformationItems),
      db.query.libraryEntries.findMany({
        where: eq(libraryEntries.status, "published"),
      }),
      db.query.skillReleases.findMany({
        where: eq(skillReleases.status, "published"),
      }),
    ]);
    const issues: InformationCoverageIssue[] = [];
    const semanticGroups = new Map<string, typeof items>();
    for (const item of items) {
      const key = [item.sourceType, item.sourceId, item.sourceVersion, item.kind].join(":");
      semanticGroups.set(key, [...(semanticGroups.get(key) ?? []), item]);
    }
    for (const group of semanticGroups.values()) {
      if (group.length < 2) continue;
      for (const item of group) {
        issues.push({
          code: "duplicate_information",
          owner: "information",
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          informationId: item.id,
          message: "Multiple Information rows represent the same source version and kind",
        });
      }
    }
    const ownerFor = (sourceType: string): InformationCoverageIssue["owner"] => (
      sourceType === "library_entry" ? "library"
        : sourceType === "skill_release" ? "skill"
          : sourceType === "course" ? "course"
            : sourceType === "api_operation" ? "api"
              : "information"
    );

    for (const item of items) {
      if (item.status === "draft" && item.updatedAt < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) {
        issues.push({
          code: "stuck_draft",
          owner: "information",
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          informationId: item.id,
          message: "Information draft has not changed for at least seven days",
        });
      }
      const source = await buildBundleForInformation(item.sourceType, item.sourceId, item.kind as InformationKind);
      const publishedLibraryAnnouncement = item.status === "published" && item.sourceType === "library_entry";
      if (!source.ok || (!publishedLibraryAnnouncement && source.value.sourceVersion !== item.sourceVersion)) {
        issues.push({
          code: "stale_source",
          owner: ownerFor(item.sourceType),
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          informationId: item.id,
          message: source.ok ? "Information source version is stale" : source.message,
        });
        continue;
      }
      if (item.status === "published" && source.value.sourceStatus === "withdrawn") {
        issues.push({
          code: "withdrawn_source_active_information",
          owner: ownerFor(item.sourceType),
          sourceType: item.sourceType,
          sourceId: item.sourceId,
          informationId: item.id,
          message: "Published Information points to a withdrawn source",
        });
      }
      if (item.status !== "withdrawn") {
        const readiness = await validateInformationReadiness(item.id, item.status === "draft" ? {
          allowBundleSource: { sourceType: item.sourceType, sourceId: item.sourceId },
        } : {});
        if (readiness.ok && readiness.value.issues.some((issue) => issue.code === "broken_action" || issue.code === "action_tampered")) {
          issues.push({
            code: "broken_action",
            owner: "information",
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            informationId: item.id,
            message: "Information action no longer matches the canonical OpenAPI source bundle",
          });
        }
      }
    }

    const publishedKeys = new Set(items.filter((item) => item.status === "published").map((item) => (
      `${item.sourceType}:${item.sourceId}:${item.sourceVersion}`
    )));
    const publishedLibrarySourceIds = new Set(items
      .filter((item) => item.status === "published" && item.sourceType === "library_entry")
      .map((item) => item.sourceId));
    for (const entry of publishedLibrary) {
      if (!publishedLibrarySourceIds.has(entry.id)) {
        issues.push({
          code: "missing_information",
          owner: "library",
          sourceType: "library_entry",
          sourceId: entry.id,
          message: "Published Library entry has no matching published Information",
        });
      }
    }
    for (const release of publishedReleases) {
      if (!publishedKeys.has(`skill_release:${release.id}:${release.version}`)) {
        issues.push({
          code: "missing_information",
          owner: "skill",
          sourceType: "skill_release",
          sourceId: release.id,
          message: "Published Skill release has no matching published Information",
        });
      }
    }
    return domainSuccess({ calculatedAt: now, issues });
  } catch {
    return domainFailure("prerequisite-unavailable", "Information coverage could not be calculated", { retryable: true });
  }
}
