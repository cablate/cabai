import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { expirePublicSiteCache } from "@/lib/public-site-cache-invalidation";
import { libraryEntries } from "@/lib/db/schema";
import { inspectLibraryFields } from "@/lib/library-markdown";
import {
  canTransition,
  domainFailure,
  domainSuccess,
  readinessResult,
  type DomainResult,
  type ReadinessIssue,
  type ReadinessResult,
} from "./library-skill-information-domain";

const authorableShape = {
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  bodyMarkdown: z.string(),
  tags: z.array(z.string()),
  featured: z.boolean(),
} as const;

export const createLibraryEntrySchema = z.object({
  ...authorableShape,
  tags: authorableShape.tags.default([]),
  featured: authorableShape.featured.default(false),
}).strict();

export const updateLibraryEntrySchema = z.object({
  expectedRevision: z.number().int().positive(),
  slug: authorableShape.slug.optional(),
  title: authorableShape.title.optional(),
  summary: authorableShape.summary.optional(),
  bodyMarkdown: authorableShape.bodyMarkdown.optional(),
  tags: authorableShape.tags.optional(),
  featured: authorableShape.featured.optional(),
}).strict();

export const libraryTransitionSchema = z.object({
  id: z.string().min(1),
  expectedRevision: z.number().int().positive(),
}).strict();

export type CreateLibraryEntryInput = z.input<typeof createLibraryEntrySchema>;
export type UpdateLibraryEntryInput = z.input<typeof updateLibraryEntrySchema>;
export type LibraryTransitionInput = z.input<typeof libraryTransitionSchema>;
export type LibraryEntry = typeof libraryEntries.$inferSelect;
export type LibraryAdminSummary = Omit<LibraryEntry, "bodyMarkdown">;
export type LibraryPublicSummary = Pick<
  LibraryEntry,
  "id" | "slug" | "title" | "summary" | "tags" | "featured" | "revision" | "publishedAt" | "updatedAt"
>;
export type LibraryPublicDetail = LibraryPublicSummary & Pick<LibraryEntry, "bodyMarkdown">;
export type LibraryTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type LibraryExecutor = Pick<LibraryTransaction, "select" | "update">;

function validationFailure(error: z.ZodError): DomainResult<never> {
  const issues: ReadinessIssue[] = error.issues.map((item) => ({
    code: "invalid_format",
    field: item.path.join(".") || "$",
    severity: "error",
    message: item.message,
  }));
  return domainFailure("validation-failed", "Library input is invalid.", { issues });
}

function persistenceFailure(): DomainResult<never> {
  return domainFailure("prerequisite-unavailable", "Library persistence is unavailable.", { retryable: true });
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isUniqueViolation(error.cause);
}

function withoutBody(row: LibraryEntry): LibraryAdminSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    tags: row.tags,
    featured: row.featured,
    status: row.status,
    revision: row.revision,
    publishedAt: row.publishedAt,
    withdrawnAt: row.withdrawnAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toLibraryPublicSummary(row: LibraryEntry): LibraryPublicSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    tags: row.tags,
    featured: row.featured,
    revision: row.revision,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  };
}

export function toLibraryPublicDetail(row: LibraryEntry): LibraryPublicDetail {
  return { ...toLibraryPublicSummary(row), bodyMarkdown: row.bodyMarkdown };
}

export function validateLibraryEntryContent(
  input: Pick<LibraryEntry, "slug" | "title" | "summary" | "bodyMarkdown" | "tags">,
): ReadinessResult {
  return readinessResult(inspectLibraryFields(input));
}

async function rowById(executor: LibraryExecutor, id: string): Promise<LibraryEntry | undefined> {
  const [row] = await executor.select().from(libraryEntries).where(eq(libraryEntries.id, id)).limit(1);
  return row;
}

async function readinessForRow(executor: LibraryExecutor, row: LibraryEntry): Promise<ReadinessResult> {
  const issues = inspectLibraryFields(row);
  if (row.status !== "draft") {
    issues.push({
      code: "invalid_transition",
      field: "status",
      severity: "error",
      message: "Only draft Library entries can be published.",
    });
  }
  if (row.slug.length > 0) {
    const duplicate = await executor
      .select({ id: libraryEntries.id })
      .from(libraryEntries)
      .where(and(eq(libraryEntries.slug, row.slug), ne(libraryEntries.id, row.id)))
      .limit(1);
    if (duplicate.length > 0) {
      issues.push({
        code: "invalid_format",
        field: "slug",
        severity: "error",
        message: "Slug must be unique.",
      });
    }
  }
  return readinessResult(issues);
}

export async function createLibraryEntry(
  input: CreateLibraryEntryInput,
  options: { resourceId?: string } = {},
): Promise<DomainResult<LibraryEntry>> {
  const parsed = createLibraryEntrySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  try {
    const [created] = await db.insert(libraryEntries).values({
      ...parsed.data,
      ...(options.resourceId ? { id: options.resourceId } : {}),
    }).returning();
    return created ? domainSuccess(created) : persistenceFailure();
  } catch (error) {
    if (isUniqueViolation(error)) return domainFailure("conflict", "Library slug already exists.");
    return persistenceFailure();
  }
}

export async function listLibraryEntries(): Promise<DomainResult<LibraryAdminSummary[]>> {
  try {
    const rows = await db.select().from(libraryEntries).orderBy(desc(libraryEntries.updatedAt), desc(libraryEntries.id));
    return domainSuccess(rows.map(withoutBody));
  } catch {
    return persistenceFailure();
  }
}

export async function getLibraryEntry(id: string): Promise<DomainResult<LibraryEntry>> {
  try {
    const row = await rowById(db, id);
    return row ? domainSuccess(row) : domainFailure("not-found", "Library entry was not found.");
  } catch {
    return persistenceFailure();
  }
}

export async function listPublishedLibraryEntries(): Promise<DomainResult<LibraryPublicSummary[]>> {
  try {
    const rows = await db
      .select()
      .from(libraryEntries)
      .where(eq(libraryEntries.status, "published"))
      .orderBy(desc(libraryEntries.publishedAt), desc(libraryEntries.id));
    return domainSuccess(rows.map(toLibraryPublicSummary));
  } catch {
    return persistenceFailure();
  }
}

export async function getPublishedLibraryEntry(idOrSlug: string): Promise<DomainResult<LibraryPublicDetail>> {
  try {
    const [row] = await db
      .select()
      .from(libraryEntries)
      .where(and(
        or(eq(libraryEntries.id, idOrSlug), eq(libraryEntries.slug, idOrSlug)),
        eq(libraryEntries.status, "published"),
      ))
      .limit(1);
    return row ? domainSuccess(toLibraryPublicDetail(row)) : domainFailure("not-found", "Library entry was not found.");
  } catch {
    return persistenceFailure();
  }
}

export const getPublishedLibraryEntryBySlug = getPublishedLibraryEntry;

export async function getLibraryEntryReadiness(id: string): Promise<DomainResult<ReadinessResult>> {
  try {
    const row = await rowById(db, id);
    return row
      ? domainSuccess(await readinessForRow(db, row))
      : domainFailure("not-found", "Library entry was not found.");
  } catch {
    return persistenceFailure();
  }
}

export const validateLibraryEntryReadiness = getLibraryEntryReadiness;

export async function updateLibraryEntry(
  id: string,
  input: UpdateLibraryEntryInput,
): Promise<DomainResult<LibraryEntry>> {
  const parsed = updateLibraryEntrySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { expectedRevision, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0) {
    return domainFailure("validation-failed", "At least one authorable field is required.", {
      issues: [{ code: "required", field: "$", severity: "error", message: "No update fields were provided." }],
    });
  }

  try {
    const current = await rowById(db, id);
    if (!current) return domainFailure("not-found", "Library entry was not found.");
    if (current.status === "withdrawn") {
      return domainFailure("immutable", "Withdrawn Library content cannot be updated directly.");
    }
    if (current.status === "published" && changes.slug !== undefined && changes.slug !== current.slug) {
      return domainFailure("validation-failed", "A published Library slug cannot be changed.", {
        issues: [{
          code: "invalid_transition",
          field: "slug",
          severity: "error",
          message: "Published Library URLs must remain stable.",
        }],
      });
    }

    const [updated] = await db
      .update(libraryEntries)
      .set({ ...changes, revision: sql`${libraryEntries.revision} + 1`, updatedAt: new Date() })
      .where(and(
        eq(libraryEntries.id, id),
        eq(libraryEntries.status, current.status),
        eq(libraryEntries.revision, expectedRevision),
      ))
      .returning();
    if (updated) {
      if (updated.status === "published") expirePublicSiteCache("library");
      return domainSuccess(updated);
    }

    const latest = await rowById(db, id);
    if (!latest) return domainFailure("not-found", "Library entry was not found.");
    if (latest.status === "withdrawn") return domainFailure("immutable", "Withdrawn Library content cannot be updated directly.");
    return domainFailure("stale-revision", "Library entry revision is stale.");
  } catch (error) {
    if (isUniqueViolation(error)) return domainFailure("conflict", "Library slug already exists.");
    return persistenceFailure();
  }
}

export async function publishLibraryEntryInTransaction(
  tx: LibraryTransaction,
  input: LibraryTransitionInput,
): Promise<DomainResult<LibraryEntry>> {
  const parsed = libraryTransitionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const current = await rowById(tx, parsed.data.id);
  if (!current) return domainFailure("not-found", "Library entry was not found.");
  if (current.revision !== parsed.data.expectedRevision) {
    return domainFailure("stale-revision", "Library entry revision is stale.");
  }
  if (!canTransition("library", current.status, "published")) {
    return domainFailure("invalid-transition", `Cannot publish a Library entry from ${current.status}.`);
  }
  const readiness = await readinessForRow(tx, current);
  if (!readiness.ready) {
    return domainFailure("validation-failed", "Library entry is not ready to publish.", { issues: readiness.issues });
  }

  const [published] = await tx
    .update(libraryEntries)
    .set({
      status: "published",
      revision: sql`${libraryEntries.revision} + 1`,
      publishedAt: new Date(),
      withdrawnAt: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(libraryEntries.id, current.id),
      eq(libraryEntries.status, "draft"),
      eq(libraryEntries.revision, parsed.data.expectedRevision),
    ))
    .returning();
  return published
    ? domainSuccess(published)
    : domainFailure("stale-revision", "Library entry revision is stale.");
}

export async function publishLibraryEntry(input: LibraryTransitionInput): Promise<DomainResult<LibraryEntry>> {
  try {
    const result = await db.transaction((tx) => publishLibraryEntryInTransaction(tx, input));
    if (result.ok) expirePublicSiteCache("library");
    return result;
  } catch {
    return persistenceFailure();
  }
}

export async function withdrawLibraryEntryInTransaction(
  tx: LibraryTransaction,
  input: LibraryTransitionInput,
): Promise<DomainResult<LibraryEntry>> {
  const parsed = libraryTransitionSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const current = await rowById(tx, parsed.data.id);
  if (!current) return domainFailure("not-found", "Library entry was not found.");
  if (current.revision !== parsed.data.expectedRevision) {
    return domainFailure("stale-revision", "Library entry revision is stale.");
  }
  if (!canTransition("library", current.status, "withdrawn")) {
    return domainFailure("invalid-transition", `Cannot withdraw a Library entry from ${current.status}.`);
  }

  const [withdrawn] = await tx
    .update(libraryEntries)
    .set({
      status: "withdrawn",
      revision: sql`${libraryEntries.revision} + 1`,
      withdrawnAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(libraryEntries.id, current.id),
      eq(libraryEntries.status, "published"),
      eq(libraryEntries.revision, parsed.data.expectedRevision),
    ))
    .returning();
  return withdrawn
    ? domainSuccess(withdrawn)
    : domainFailure("stale-revision", "Library entry revision is stale.");
}

export async function withdrawLibraryEntry(input: LibraryTransitionInput): Promise<DomainResult<LibraryEntry>> {
  try {
    const result = await db.transaction((tx) => withdrawLibraryEntryInTransaction(tx, input));
    if (result.ok) expirePublicSiteCache("library");
    return result;
  } catch {
    return persistenceFailure();
  }
}
