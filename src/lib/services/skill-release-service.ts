import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { computeChanges, writeAuditLog } from "@/lib/audit";
import { db } from "@/lib/db";
import { expirePublicSiteCache } from "@/lib/public-site-cache-invalidation";
import {
  skillReleases,
  skills,
  type Skill,
  type SkillRelease,
} from "@/lib/db/schema";
import {
  canTransition,
  domainFailure,
  domainSuccess,
  readinessResult,
  type DomainActor,
  type DomainFailure,
  type DomainResult,
  type ReadinessIssue,
  type ReadinessResult,
  type SkillReleaseStatus,
  type SkillStatus,
} from "./library-skill-information-domain";
import { getSkillReleaseArtifactPrerequisites } from "./skill-artifact-service";
import type { StorageProvider } from "@/lib/storage/types";

const slugSchema = z.string().trim().min(1).max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase kebab-case slug");
const titleSchema = z.string().trim().min(1).max(200);
const summarySchema = z.string().trim().min(1).max(1_000);
const tagSchema = z.string().trim().min(1).max(64);
const tagsSchema = z.array(tagSchema).max(20).superRefine((tags, context) => {
  if (new Set(tags).size !== tags.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "tags must be unique" });
  }
});
const versionSchema = z.string().trim().min(1).max(100)
  .regex(/^[0-9A-Za-z][0-9A-Za-z._+-]*$/, "contains unsupported characters");
const distributionModeSchema = z.enum(["hosted", "github"]);
const sourceRepositoryUrlSchema = z.string().trim().url().max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:"
        && url.hostname === "github.com"
        && url.pathname.split("/").filter(Boolean).length === 2;
    } catch {
      return false;
    }
  }, "must be a GitHub repository URL")
  .transform((value) => value.replace(/\.git$/i, "").replace(/\/+$/, ""));
const sourceRefSchema = z.string().trim().min(1).max(200)
  .regex(/^[0-9A-Za-z][0-9A-Za-z._/+\-]*$/, "contains unsupported characters");
const sourceCommitShaSchema = z.string().trim()
  .regex(/^[0-9a-f]{40}$/, "must be a full lowercase Git commit SHA");
const checksumSchema = z.string().regex(/^[0-9a-f]{64}$/, "must be a lowercase SHA-256 checksum");
const actorSchema = z.object({
  type: z.enum(["user", "agent", "system"]),
  id: z.string().min(1),
  name: z.string().min(1).optional(),
}).strict();

export const createSkillInputSchema = z.object({
  slug: slugSchema,
  title: titleSchema,
  summary: summarySchema,
  tags: tagsSchema.default([]),
  bodyMarkdown: z.string().max(100_000).default(""),
  distributionMode: distributionModeSchema.default("hosted"),
  sourceRepositoryUrl: sourceRepositoryUrlSchema.nullable().default(null),
  sourceRef: sourceRefSchema.nullable().default(null),
}).strict();

export const updateSkillInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
  slug: slugSchema.optional(),
  title: titleSchema.optional(),
  summary: summarySchema.optional(),
  tags: tagsSchema.optional(),
  bodyMarkdown: z.string().max(100_000).optional(),
  distributionMode: distributionModeSchema.optional(),
  sourceRepositoryUrl: sourceRepositoryUrlSchema.nullable().optional(),
  sourceRef: sourceRefSchema.nullable().optional(),
}).strict().refine(
  (input) => Object.keys(input).some((key) => key !== "expectedRevision"),
  { message: "at least one authorable field is required" },
);

const releaseAuthorableFields = {
  version: versionSchema,
  compatibility: z.string().trim().max(2_000),
  contentMarkdown: z.string().max(100_000),
  license: z.string().trim().max(500),
  changelogMarkdown: z.string().max(100_000),
  accessPolicy: z.enum(["public", "authenticated"]),
} as const;

export const createSkillReleaseInputSchema = z.object({
  skillId: z.string().min(1),
  version: releaseAuthorableFields.version,
  compatibility: releaseAuthorableFields.compatibility.default(""),
  contentMarkdown: releaseAuthorableFields.contentMarkdown.default(""),
  license: releaseAuthorableFields.license.default(""),
  changelogMarkdown: releaseAuthorableFields.changelogMarkdown.default(""),
  accessPolicy: releaseAuthorableFields.accessPolicy.default("authenticated"),
}).strict();

export const updateSkillReleaseInputSchema = z.object({
  expectedRevision: z.number().int().positive(),
  version: releaseAuthorableFields.version.optional(),
  compatibility: releaseAuthorableFields.compatibility.optional(),
  contentMarkdown: releaseAuthorableFields.contentMarkdown.optional(),
  license: releaseAuthorableFields.license.optional(),
  changelogMarkdown: releaseAuthorableFields.changelogMarkdown.optional(),
  accessPolicy: releaseAuthorableFields.accessPolicy.optional(),
}).strict().refine(
  (input) => Object.keys(input).some((key) => key !== "expectedRevision"),
  { message: "at least one authorable field is required" },
);

export const publishSkillReleaseInputSchema = z.object({
  skillId: z.string().min(1),
  releaseId: z.string().min(1),
  expectedSkillRevision: z.number().int().positive(),
  expectedReleaseRevision: z.number().int().positive(),
}).strict();

export const transitionSkillInputSchema = z.object({
  skillId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
}).strict();

export const transitionSkillReleaseInputSchema = z.object({
  releaseId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
}).strict();

export type CreateSkillInput = z.input<typeof createSkillInputSchema>;
export type UpdateSkillInput = z.input<typeof updateSkillInputSchema>;
export type CreateSkillReleaseInput = z.input<typeof createSkillReleaseInputSchema>;
export type UpdateSkillReleaseInput = z.input<typeof updateSkillReleaseInputSchema>;
export type PublishSkillReleaseInput = z.input<typeof publishSkillReleaseInputSchema>;
export type TransitionSkillInput = z.input<typeof transitionSkillInputSchema>;
export type TransitionSkillReleaseInput = z.input<typeof transitionSkillReleaseInputSchema>;

export type SkillReleaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ArtifactPrerequisiteState = "verified" | "missing" | "invalid" | "unavailable";

/**
 * Evidence supplied by WP-03. This service never calls storage or parses an
 * archive. Missing evidence intentionally keeps a release out of ready state.
 */
export interface SkillReleaseArtifactPrerequisites {
  binding: ArtifactPrerequisiteState;
  storageHead: ArtifactPrerequisiteState;
  checksum: ArtifactPrerequisiteState;
  archive: ArtifactPrerequisiteState;
}

export interface SkillReleaseReadinessContext {
  parentSkillExists: boolean;
  versionAvailable: boolean;
  distributionMode?: "hosted" | "github";
  artifact?: SkillReleaseArtifactPrerequisites;
}

export const skillVisibility: Record<SkillStatus, { admin: true; public: boolean }> = {
  draft: { admin: true, public: false },
  published: { admin: true, public: true },
  withdrawn: { admin: true, public: false },
};

export const skillReleaseVisibility: Record<SkillReleaseStatus, {
  admin: true;
  public: boolean;
  downloadable: boolean;
  deprecated: boolean;
}> = {
  draft: { admin: true, public: false, downloadable: false, deprecated: false },
  published: { admin: true, public: true, downloadable: true, deprecated: false },
  deprecated: { admin: true, public: true, downloadable: true, deprecated: true },
  withdrawn: { admin: true, public: false, downloadable: false, deprecated: false },
};

export interface AdminSkillProjection {
  skill: Skill;
  releases: SkillRelease[];
}

export type PublicSkillDistribution =
  | { mode: "hosted" }
  | {
    mode: "github";
    repositoryUrl: string;
    sourceVerifiedAt: Date | null;
    sourceBrowseUrl: string;
    installGuideUrl: string;
    sourceArchiveUrl: string;
    releaseUrl: string;
  };

export interface PublicSkillReleaseProjection {
  id: string;
  skillId: string;
  version?: string;
  checksumSha256?: string;
  compatibility: string;
  contentMarkdown: string;
  license: string;
  changelogMarkdown: string;
  accessPolicy: "public" | "authenticated";
  status: "published" | "deprecated";
  publishedAt: Date;
  deprecatedAt: Date | null;
  downloadRequiresAuthentication: boolean;
  downloadableForViewer: boolean;
  distribution: PublicSkillDistribution;
}

export interface PublicSkillProjection {
  id: string;
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  bodyMarkdown: string;
  publishedAt: Date;
  currentRelease: PublicSkillReleaseProjection;
  releases: PublicSkillReleaseProjection[];
}

export interface PublicSkillReleaseSummaryProjection {
  id: string;
  skillId: string;
  version: string;
  checksumSha256: string;
  compatibility: string;
  license: string;
  accessPolicy: "public" | "authenticated";
  status: "published" | "deprecated";
  publishedAt: Date;
  deprecatedAt: Date | null;
  downloadRequiresAuthentication: boolean;
  downloadableForViewer: boolean;
}

export interface PublicSkillCollectionProjection {
  id: string;
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  publishedAt: Date;
  currentRelease: PublicSkillReleaseSummaryProjection;
}

function issue(
  code: ReadinessIssue["code"],
  field: string,
  message: string,
): ReadinessIssue {
  return { code, field, severity: "error", message };
}

function requiredText(value: string, field: string, issues: ReadinessIssue[]): void {
  if (!value.trim()) issues.push(issue("required", field, `${field} is required`));
}

type SkillSourceConfiguration = Pick<Skill,
  | "distributionMode"
  | "sourceRepositoryUrl"
  | "sourceRef"
  | "sourceCommitSha"
  | "sourceVerifiedAt"
>;

function validateSkillSourceConfiguration(configuration: SkillSourceConfiguration): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  if (configuration.distributionMode === "hosted") {
    if (
      configuration.sourceRepositoryUrl
      || configuration.sourceRef
      || configuration.sourceCommitSha
      || configuration.sourceVerifiedAt
    ) {
      issues.push(issue("invalid_format", "distributionMode", "Hosted Skills cannot define GitHub source metadata"));
    }
    return issues;
  }

  if (!configuration.sourceRepositoryUrl) {
    issues.push(issue("required", "sourceRepositoryUrl", "GitHub repository URL is required"));
  } else if (!sourceRepositoryUrlSchema.safeParse(configuration.sourceRepositoryUrl).success) {
    issues.push(issue("invalid_format", "sourceRepositoryUrl", "GitHub repository URL is invalid"));
  }
  if (!configuration.sourceRef) {
    issues.push(issue("required", "sourceRef", "A fixed GitHub tag or ref is required"));
  } else if (!sourceRefSchema.safeParse(configuration.sourceRef).success) {
    issues.push(issue("invalid_format", "sourceRef", "GitHub source ref is invalid"));
  }
  if (configuration.sourceCommitSha && !sourceCommitShaSchema.safeParse(configuration.sourceCommitSha).success) {
    issues.push(issue("invalid_format", "sourceCommitSha", "GitHub source commit must be a full lowercase SHA"));
  }
  if (configuration.sourceVerifiedAt && !configuration.sourceCommitSha) {
    issues.push(issue("required", "sourceCommitSha", "Verified GitHub source requires a commit SHA"));
  }
  return issues;
}

function sourceConfigurationFailure(configuration: SkillSourceConfiguration): DomainFailure | null {
  const issues = validateSkillSourceConfiguration(configuration);
  return issues.length
    ? domainFailure("validation-failed", "Skill distribution configuration is invalid", { issues })
    : null;
}

function encodeGitHubRef(value: string): string {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

export function toPublicSkillDistribution(
  skill: SkillSourceConfiguration,
): PublicSkillDistribution | null {
  if (validateSkillSourceConfiguration(skill).length > 0) return null;
  if (skill.distributionMode === "hosted") return { mode: "hosted" };

  const repositoryUrl = skill.sourceRepositoryUrl!;
  const sourceRef = skill.sourceRef!;
  const pinnedRef = skill.sourceCommitSha ?? sourceRef;
  const encodedPinnedRef = encodeGitHubRef(pinnedRef);
  return {
    mode: "github",
    repositoryUrl,
    sourceVerifiedAt: skill.sourceVerifiedAt,
    sourceBrowseUrl: `${repositoryUrl}/tree/${encodedPinnedRef}`,
    installGuideUrl: `${repositoryUrl}/blob/${encodedPinnedRef}/install/AGENT-INSTALL.md`,
    sourceArchiveUrl: `${repositoryUrl}/archive/${encodedPinnedRef}.zip`,
    releaseUrl: `${repositoryUrl}/releases/tag/${encodeGitHubRef(sourceRef)}`,
  };
}

export function validateSkillReadiness(
  skill: Pick<Skill,
    | "slug"
    | "title"
    | "summary"
    | "distributionMode"
    | "sourceRepositoryUrl"
    | "sourceRef"
    | "sourceCommitSha"
    | "sourceVerifiedAt"
  >,
): ReadinessResult {
  const issues: ReadinessIssue[] = [];
  requiredText(skill.slug, "slug", issues);
  requiredText(skill.title, "title", issues);
  requiredText(skill.summary, "summary", issues);
  if (skill.slug && !slugSchema.safeParse(skill.slug).success) {
    issues.push(issue("invalid_format", "slug", "slug must be lowercase kebab-case"));
  }
  issues.push(...validateSkillSourceConfiguration(skill));
  return readinessResult(issues);
}

function prerequisiteIssue(
  field: string,
  state: ArtifactPrerequisiteState,
): ReadinessIssue | null {
  if (state === "verified") return null;
  if (field === "artifact.checksum" && state === "invalid") {
    return issue("checksum_mismatch", field, "artifact checksum verification failed");
  }
  if (field === "artifact.archive" && state === "invalid") {
    return issue("invalid_format", field, "artifact archive validation failed");
  }
  return issue(
    "missing_artifact",
    field,
    state === "unavailable"
      ? `${field} prerequisite is unavailable until WP-03 supplies evidence`
      : `${field} prerequisite is not satisfied`,
  );
}

export function validateSkillReleaseReadiness(
  release: Pick<SkillRelease,
    | "skillId"
    | "version"
    | "artifactMediaId"
    | "checksumSha256"
    | "compatibility"
    | "license"
    | "accessPolicy"
    | "artifactManifest"
    | "artifactValidation"
    | "artifactValidatedAt"
  >,
  context: SkillReleaseReadinessContext,
): ReadinessResult {
  const issues: ReadinessIssue[] = [];
  if (!context.parentSkillExists) issues.push(issue("required", "skillId", "parent Skill does not exist"));
  requiredText(release.skillId, "skillId", issues);
  requiredText(release.version, "version", issues);
  requiredText(release.license, "license", issues);
  requiredText(release.compatibility, "compatibility", issues);
  if (release.version && !versionSchema.safeParse(release.version).success) {
    issues.push(issue("invalid_format", "version", "version format is invalid"));
  }
  if (!context.versionAvailable) {
    issues.push(issue("invalid_format", "version", "version already exists for this Skill"));
  }
  if (release.accessPolicy !== "public" && release.accessPolicy !== "authenticated") {
    issues.push(issue("invalid_format", "accessPolicy", "access policy is invalid"));
  }
  if (context.distributionMode !== "github") {
    if (!release.artifactMediaId) {
      issues.push(issue("missing_artifact", "artifactMediaId", "confirmed bound artifact is required"));
    }
    if (!release.checksumSha256) {
      issues.push(issue("missing_artifact", "checksumSha256", "artifact checksum is required"));
    } else if (!checksumSchema.safeParse(release.checksumSha256).success) {
      issues.push(issue("invalid_format", "checksumSha256", "checksum must be lowercase SHA-256"));
    }
    if (!release.artifactManifest || release.artifactValidation?.valid !== true || !release.artifactValidatedAt) {
      issues.push(issue("missing_artifact", "artifactValidation", "validated artifact evidence is required"));
    }

    if (release.artifactMediaId && release.checksumSha256) {
      const evidence = context.artifact ?? {
        binding: "unavailable",
        storageHead: "unavailable",
        checksum: "unavailable",
        archive: "unavailable",
      };
      for (const [field, state] of [
        ["artifact.binding", evidence.binding],
        ["artifact.storageHead", evidence.storageHead],
        ["artifact.checksum", evidence.checksum],
        ["artifact.archive", evidence.archive],
      ] as const) {
        const found = prerequisiteIssue(field, state);
        if (found) issues.push(found);
      }
    }
  }
  return readinessResult(issues);
}

export function toPublicSkillReleaseProjection(
  release: SkillRelease,
  viewer: { authenticated: boolean },
  distribution: PublicSkillDistribution = { mode: "hosted" },
): PublicSkillReleaseProjection | null {
  const visibility = skillReleaseVisibility[release.status];
  if (
    (release.status !== "published" && release.status !== "deprecated") ||
    !visibility.public ||
    !release.publishedAt ||
    (distribution.mode === "hosted" && !release.checksumSha256)
  ) return null;
  const downloadRequiresAuthentication = distribution.mode === "hosted" && release.accessPolicy === "authenticated";
  return {
    id: release.id,
    skillId: release.skillId,
    ...(distribution.mode === "hosted" ? {
      version: release.version,
      checksumSha256: release.checksumSha256!,
    } : {}),
    compatibility: release.compatibility,
    contentMarkdown: release.contentMarkdown,
    license: release.license,
    changelogMarkdown: release.changelogMarkdown,
    accessPolicy: release.accessPolicy,
    status: release.status,
    publishedAt: release.publishedAt,
    deprecatedAt: release.deprecatedAt,
    downloadRequiresAuthentication,
    downloadableForViewer: distribution.mode === "hosted"
      && visibility.downloadable
      && (!downloadRequiresAuthentication || viewer.authenticated),
    distribution,
  };
}

export function toPublicSkillProjection(
  skill: Skill,
  releases: SkillRelease[],
  viewer: { authenticated: boolean },
): PublicSkillProjection | null {
  if (!skillVisibility[skill.status].public || !skill.publishedAt || !skill.currentReleaseId) return null;
  const distribution = toPublicSkillDistribution(skill);
  if (!distribution) return null;
  const projectedReleases = releases
    .map((release) => toPublicSkillReleaseProjection(release, viewer, distribution))
    .filter((release): release is PublicSkillReleaseProjection => release !== null);
  const currentRelease = projectedReleases.find((release) => release.id === skill.currentReleaseId);
  if (!currentRelease) return null;
  return {
    id: skill.id,
    slug: skill.slug,
    title: skill.title,
    summary: skill.summary,
    tags: skill.tags,
    bodyMarkdown: skill.bodyMarkdown.trim() || currentRelease.contentMarkdown,
    publishedAt: skill.publishedAt,
    currentRelease,
    releases: projectedReleases,
  };
}

export function toPublicSkillReleaseSummaryProjection(
  release: Pick<SkillRelease,
    | "id"
    | "skillId"
    | "version"
    | "checksumSha256"
    | "compatibility"
    | "license"
    | "accessPolicy"
    | "status"
    | "publishedAt"
    | "deprecatedAt"
  >,
  viewer: { authenticated: boolean },
): PublicSkillReleaseSummaryProjection | null {
  const visibility = skillReleaseVisibility[release.status];
  if (
    (release.status !== "published" && release.status !== "deprecated") ||
    !visibility.public ||
    !release.publishedAt ||
    !release.checksumSha256
  ) return null;
  const downloadRequiresAuthentication = release.accessPolicy === "authenticated";
  return {
    id: release.id,
    skillId: release.skillId,
    version: release.version,
    checksumSha256: release.checksumSha256,
    compatibility: release.compatibility,
    license: release.license,
    accessPolicy: release.accessPolicy,
    status: release.status,
    publishedAt: release.publishedAt,
    deprecatedAt: release.deprecatedAt,
    downloadRequiresAuthentication,
    downloadableForViewer: visibility.downloadable && (!downloadRequiresAuthentication || viewer.authenticated),
  };
}

export function toPublicSkillCollectionProjection(
  skill: Skill,
  currentRelease: Pick<SkillRelease,
    | "id"
    | "skillId"
    | "version"
    | "checksumSha256"
    | "compatibility"
    | "license"
    | "accessPolicy"
    | "status"
    | "publishedAt"
    | "deprecatedAt"
  > | undefined,
  viewer: { authenticated: boolean },
): PublicSkillCollectionProjection | null {
  if (!skillVisibility[skill.status].public || !skill.publishedAt || !skill.currentReleaseId) return null;
  if (!currentRelease || currentRelease.id !== skill.currentReleaseId || currentRelease.skillId !== skill.id) return null;
  const release = toPublicSkillReleaseSummaryProjection(currentRelease, viewer);
  if (!release) return null;
  return {
    id: skill.id,
    slug: skill.slug,
    title: skill.title,
    summary: skill.summary,
    tags: skill.tags,
    publishedAt: skill.publishedAt,
    currentRelease: release,
  };
}

function zodFailure(error: z.ZodError): DomainFailure {
  const issues = error.issues.map((entry) => issue(
    entry.code === "invalid_type" && "received" in entry && entry.received === "undefined"
      ? "required"
      : "invalid_format",
    entry.path.join(".") || "input",
    entry.message,
  ));
  return domainFailure("validation-failed", "Skill input validation failed", { issues });
}

function parseInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): DomainResult<z.output<TSchema>> {
  const parsed = schema.safeParse(input);
  return parsed.success ? domainSuccess(parsed.data) : zodFailure(parsed.error);
}

function validateActor(actor: DomainActor): DomainFailure | null {
  const parsed = actorSchema.safeParse(actor);
  return parsed.success ? null : zodFailure(parsed.error);
}

function databaseCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? databaseCode(error.cause) : null;
}

function databaseFailure(error: unknown): DomainFailure {
  const code = databaseCode(error);
  if (code === "23505") return domainFailure("conflict", "Skill identity or release version already exists");
  if (code === "23503") return domainFailure("validation-failed", "Referenced Skill or artifact does not exist");
  return domainFailure("prerequisite-unavailable", "Skill persistence is temporarily unavailable", { retryable: true });
}

async function lockSkill(tx: SkillReleaseTransaction, skillId: string): Promise<Skill | undefined> {
  await tx.execute(sql`select ${skills.id} from ${skills} where ${skills.id} = ${skillId} for update`);
  return tx.query.skills.findFirst({ where: eq(skills.id, skillId) });
}

async function lockRelease(tx: SkillReleaseTransaction, releaseId: string): Promise<SkillRelease | undefined> {
  await tx.execute(sql`select ${skillReleases.id} from ${skillReleases} where ${skillReleases.id} = ${releaseId} for update`);
  return tx.query.skillReleases.findFirst({ where: eq(skillReleases.id, releaseId) });
}

export async function createSkillInTransaction(
  tx: SkillReleaseTransaction,
  input: z.output<typeof createSkillInputSchema>,
  resourceId?: string,
): Promise<DomainResult<Skill>> {
  const sourceFailure = sourceConfigurationFailure({
    distributionMode: input.distributionMode,
    sourceRepositoryUrl: input.sourceRepositoryUrl,
    sourceRef: input.sourceRef,
    sourceCommitSha: null,
    sourceVerifiedAt: null,
  });
  if (sourceFailure) return sourceFailure;
  const duplicate = await tx.query.skills.findFirst({
    where: eq(skills.slug, input.slug),
    columns: { id: true },
  });
  if (duplicate) return domainFailure("conflict", "Skill slug already exists");
  const [created] = await tx.insert(skills).values({
    ...input,
    status: "draft",
    ...(resourceId ? { id: resourceId } : {}),
  }).returning();
  return created
    ? domainSuccess(created)
    : domainFailure("prerequisite-unavailable", "Skill could not be created", { retryable: true });
}

export async function createSkill(
  input: CreateSkillInput,
  actor: DomainActor,
  options: { resourceId?: string } = {},
): Promise<DomainResult<Skill>> {
  const actorFailure = validateActor(actor);
  if (actorFailure) return actorFailure;
  const parsed = parseInput(createSkillInputSchema, input);
  if (!parsed.ok) return parsed;
  try {
    return await db.transaction((tx) => createSkillInTransaction(tx, parsed.value, options.resourceId));
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function updateSkillInTransaction(
  tx: SkillReleaseTransaction,
  skillId: string,
  input: z.output<typeof updateSkillInputSchema>,
  options: { allowPublishedMetadata?: boolean } = {},
): Promise<DomainResult<Skill>> {
  const current = await lockSkill(tx, skillId);
  if (!current) return domainFailure("not-found", "Skill not found");
  if (current.revision !== input.expectedRevision) {
    return domainFailure("stale-revision", "Skill was updated by another writer");
  }
  const isPublishedMetadataUpdate = current.status === "published"
    && options.allowPublishedMetadata === true
    && input.slug === undefined;
  if (current.status !== "draft" && !isPublishedMetadataUpdate) {
    return domainFailure("immutable", "Published or withdrawn Skill metadata requires a governed bundle change");
  }
  if (input.slug && input.slug !== current.slug) {
    const duplicate = await tx.query.skills.findFirst({
      where: and(eq(skills.slug, input.slug), ne(skills.id, skillId)),
      columns: { id: true },
    });
    if (duplicate) return domainFailure("conflict", "Skill slug already exists");
  }
  const sourceFailure = sourceConfigurationFailure({
    distributionMode: input.distributionMode ?? current.distributionMode,
    sourceRepositoryUrl: input.sourceRepositoryUrl !== undefined
      ? input.sourceRepositoryUrl
      : current.sourceRepositoryUrl,
    sourceRef: input.sourceRef !== undefined ? input.sourceRef : current.sourceRef,
    sourceCommitSha: (
      input.distributionMode === "hosted"
      || (input.sourceRepositoryUrl !== undefined && input.sourceRepositoryUrl !== current.sourceRepositoryUrl)
      || (input.sourceRef !== undefined && input.sourceRef !== current.sourceRef)
    ) ? null : current.sourceCommitSha,
    sourceVerifiedAt: (
      input.distributionMode === "hosted"
      || (input.sourceRepositoryUrl !== undefined && input.sourceRepositoryUrl !== current.sourceRepositoryUrl)
      || (input.sourceRef !== undefined && input.sourceRef !== current.sourceRef)
    ) ? null : current.sourceVerifiedAt,
  });
  if (sourceFailure) return sourceFailure;
  const changes = {
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.bodyMarkdown !== undefined ? { bodyMarkdown: input.bodyMarkdown } : {}),
    ...(input.distributionMode !== undefined ? { distributionMode: input.distributionMode } : {}),
    ...(input.sourceRepositoryUrl !== undefined ? { sourceRepositoryUrl: input.sourceRepositoryUrl } : {}),
    ...(input.sourceRef !== undefined ? { sourceRef: input.sourceRef } : {}),
    ...(
      input.distributionMode === "hosted"
      || (input.sourceRepositoryUrl !== undefined && input.sourceRepositoryUrl !== current.sourceRepositoryUrl)
      || (input.sourceRef !== undefined && input.sourceRef !== current.sourceRef)
        ? { sourceCommitSha: null, sourceVerifiedAt: null }
        : {}
    ),
  };
  const [updated] = await tx.update(skills).set({
    ...changes,
    revision: current.revision + 1,
    updatedAt: new Date(),
  }).where(and(eq(skills.id, skillId), eq(skills.revision, current.revision))).returning();
  if (!updated) return domainFailure("stale-revision", "Skill was updated by another writer");
  return domainSuccess(updated);
}

export async function updateSkill(
  skillId: string,
  input: UpdateSkillInput,
  actor: DomainActor,
  options: { allowPublishedMetadata?: boolean; idempotencyKey?: string } = {},
): Promise<DomainResult<Skill>> {
  const actorFailure = validateActor(actor);
  if (actorFailure) return actorFailure;
  const parsed = parseInput(updateSkillInputSchema, input);
  if (!parsed.ok) return parsed;
  const before = await db.query.skills.findFirst({ where: eq(skills.id, skillId) });
  if (!before) return domainFailure("not-found", "Skill not found");
  try {
    const result = await db.transaction((tx) => updateSkillInTransaction(tx, skillId, parsed.value, options));
    if (result.ok) {
      expirePublicSiteCache("skills");
      await writeAuditLog({
        actorType: actor.type,
        actorId: actor.id,
        action: "update_metadata",
        entityType: "skill",
        entityId: skillId,
        changes: computeChanges(
          {
            slug: before.slug,
            title: before.title,
            summary: before.summary,
            tags: before.tags,
            bodyMarkdown: before.bodyMarkdown,
            distributionMode: before.distributionMode,
            sourceRepositoryUrl: before.sourceRepositoryUrl,
            sourceRef: before.sourceRef,
            sourceCommitSha: before.sourceCommitSha,
            sourceVerifiedAt: before.sourceVerifiedAt,
          },
          {
            slug: result.value.slug,
            title: result.value.title,
            summary: result.value.summary,
            tags: result.value.tags,
            bodyMarkdown: result.value.bodyMarkdown,
            distributionMode: result.value.distributionMode,
            sourceRepositoryUrl: result.value.sourceRepositoryUrl,
            sourceRef: result.value.sourceRef,
            sourceCommitSha: result.value.sourceCommitSha,
            sourceVerifiedAt: result.value.sourceVerifiedAt,
          },
        ),
        metadata: options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined,
      });
    }
    return result;
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function createSkillReleaseInTransaction(
  tx: SkillReleaseTransaction,
  input: z.output<typeof createSkillReleaseInputSchema>,
  resourceId?: string,
): Promise<DomainResult<SkillRelease>> {
  const parent = await tx.query.skills.findFirst({ where: eq(skills.id, input.skillId) });
  if (!parent) return domainFailure("not-found", "Parent Skill not found");
  if (parent.status === "withdrawn") {
    return domainFailure("invalid-transition", "Cannot add a release to a withdrawn Skill");
  }
  const duplicate = await tx.query.skillReleases.findFirst({
    where: and(eq(skillReleases.skillId, input.skillId), eq(skillReleases.version, input.version)),
    columns: { id: true },
  });
  if (duplicate) return domainFailure("conflict", "Skill release version already exists");
  const [created] = await tx.insert(skillReleases).values({
    ...input,
    status: "draft",
    ...(resourceId ? { id: resourceId } : {}),
  }).returning();
  return created
    ? domainSuccess(created)
    : domainFailure("prerequisite-unavailable", "Skill release could not be created", { retryable: true });
}

export async function createSkillRelease(
  input: CreateSkillReleaseInput,
  actor: DomainActor,
  options: { resourceId?: string } = {},
): Promise<DomainResult<SkillRelease>> {
  const actorFailure = validateActor(actor);
  if (actorFailure) return actorFailure;
  const parsed = parseInput(createSkillReleaseInputSchema, input);
  if (!parsed.ok) return parsed;
  try {
    return await db.transaction((tx) => createSkillReleaseInTransaction(tx, parsed.value, options.resourceId));
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function updateSkillReleaseInTransaction(
  tx: SkillReleaseTransaction,
  releaseId: string,
  input: z.output<typeof updateSkillReleaseInputSchema>,
): Promise<DomainResult<SkillRelease>> {
  const current = await lockRelease(tx, releaseId);
  if (!current) return domainFailure("not-found", "Skill release not found");
  if (current.revision !== input.expectedRevision) {
    return domainFailure("stale-revision", "Skill release was updated by another writer");
  }
  if (current.status !== "draft") {
    return domainFailure("immutable", "Published Skill release metadata and content are immutable");
  }
  if (input.version && input.version !== current.version) {
    const duplicate = await tx.query.skillReleases.findFirst({
      where: and(
        eq(skillReleases.skillId, current.skillId),
        eq(skillReleases.version, input.version),
        ne(skillReleases.id, releaseId),
      ),
      columns: { id: true },
    });
    if (duplicate) return domainFailure("conflict", "Skill release version already exists");
  }
  const changes = {
    ...(input.version !== undefined ? { version: input.version } : {}),
    ...(input.compatibility !== undefined ? { compatibility: input.compatibility } : {}),
    ...(input.contentMarkdown !== undefined ? { contentMarkdown: input.contentMarkdown } : {}),
    ...(input.license !== undefined ? { license: input.license } : {}),
    ...(input.changelogMarkdown !== undefined ? { changelogMarkdown: input.changelogMarkdown } : {}),
    ...(input.accessPolicy !== undefined ? { accessPolicy: input.accessPolicy } : {}),
  };
  const [updated] = await tx.update(skillReleases).set({
    ...changes,
    revision: current.revision + 1,
    updatedAt: new Date(),
  }).where(and(eq(skillReleases.id, releaseId), eq(skillReleases.revision, current.revision))).returning();
  if (!updated) return domainFailure("stale-revision", "Skill release was updated by another writer");
  return domainSuccess(updated);
}

export async function updateSkillRelease(
  releaseId: string,
  input: UpdateSkillReleaseInput,
  actor: DomainActor,
): Promise<DomainResult<SkillRelease>> {
  const actorFailure = validateActor(actor);
  if (actorFailure) return actorFailure;
  const parsed = parseInput(updateSkillReleaseInputSchema, input);
  if (!parsed.ok) return parsed;
  try {
    return await db.transaction((tx) => updateSkillReleaseInTransaction(tx, releaseId, parsed.value));
  } catch (error) {
    return databaseFailure(error);
  }
}

export interface PublishedSkillReleaseResult {
  skill: Skill;
  release: SkillRelease;
}

export async function publishSkillReleaseInTransaction(
  tx: SkillReleaseTransaction,
  input: z.output<typeof publishSkillReleaseInputSchema>,
  artifact: SkillReleaseArtifactPrerequisites | undefined,
): Promise<DomainResult<PublishedSkillReleaseResult>> {
  const skill = await lockSkill(tx, input.skillId);
  if (!skill) return domainFailure("not-found", "Skill not found");
  const release = await lockRelease(tx, input.releaseId);
  if (!release) return domainFailure("not-found", "Skill release not found");
  if (release.skillId !== skill.id) {
    return domainFailure("conflict", "Skill release does not belong to the requested Skill");
  }
  if (skill.revision !== input.expectedSkillRevision || release.revision !== input.expectedReleaseRevision) {
    return domainFailure("stale-revision", "Skill or release was updated by another writer");
  }
  if (skill.status === "withdrawn") {
    return domainFailure("invalid-transition", "Withdrawn Skill cannot publish another release");
  }
  if (!canTransition("skillRelease", release.status, "published")) {
    return domainFailure("invalid-transition", `Cannot publish release from ${release.status}`);
  }
  const duplicateVersion = await tx.query.skillReleases.findFirst({
    where: and(
      eq(skillReleases.skillId, skill.id),
      eq(skillReleases.version, release.version),
      ne(skillReleases.id, release.id),
    ),
    columns: { id: true },
  });
  const readiness = readinessResult([
    ...validateSkillReadiness(skill).issues,
    ...validateSkillReleaseReadiness(release, {
      parentSkillExists: true,
      versionAvailable: !duplicateVersion,
      distributionMode: skill.distributionMode,
      artifact,
    }).issues,
  ]);
  if (!readiness.ready) {
    return domainFailure("validation-failed", "Skill release is not ready to publish", {
      issues: readiness.issues,
    });
  }

  const now = new Date();
  const [publishedRelease] = await tx.update(skillReleases).set({
    status: "published",
    publishedAt: now,
    revision: release.revision + 1,
    updatedAt: now,
  }).where(and(eq(skillReleases.id, release.id), eq(skillReleases.revision, release.revision))).returning();
  const [publishedSkill] = await tx.update(skills).set({
    status: "published",
    currentReleaseId: release.id,
    publishedAt: skill.publishedAt ?? now,
    withdrawnAt: null,
    revision: skill.revision + 1,
    updatedAt: now,
  }).where(and(eq(skills.id, skill.id), eq(skills.revision, skill.revision))).returning();
  if (!publishedRelease || !publishedSkill) {
    throw new Error("Atomic Skill release publication lost its locked rows");
  }
  return domainSuccess({ skill: publishedSkill, release: publishedRelease });
}

export async function publishSkillRelease(
  input: PublishSkillReleaseInput,
  actor: DomainActor,
  storage?: StorageProvider,
): Promise<DomainResult<PublishedSkillReleaseResult>> {
  const actorFailure = validateActor(actor);
  if (actorFailure) return actorFailure;
  const parsed = parseInput(publishSkillReleaseInputSchema, input);
  if (!parsed.ok) return parsed;
  const parent = await db.query.skills.findFirst({
    where: eq(skills.id, parsed.value.skillId),
    columns: { distributionMode: true },
  });
  const artifact = parent?.distributionMode === "github"
    ? domainSuccess(undefined)
    : await getSkillReleaseArtifactPrerequisites(parsed.value.releaseId, storage);
  if (!artifact.ok) return artifact;
  try {
    const result = await db.transaction((tx) => publishSkillReleaseInTransaction(tx, parsed.value, artifact.value));
    if (result.ok) expirePublicSiteCache("skills");
    return result;
  } catch (error) {
    return databaseFailure(error);
  }
}

async function transitionReleaseInTransaction(
  tx: SkillReleaseTransaction,
  input: z.output<typeof transitionSkillReleaseInputSchema>,
  to: "deprecated" | "withdrawn",
): Promise<DomainResult<SkillRelease>> {
  const release = await lockRelease(tx, input.releaseId);
  if (!release) return domainFailure("not-found", "Skill release not found");
  if (release.revision !== input.expectedRevision) {
    return domainFailure("stale-revision", "Skill release was updated by another writer");
  }
  if (!canTransition("skillRelease", release.status, to)) {
    return domainFailure("invalid-transition", `Cannot transition release from ${release.status} to ${to}`);
  }
  const now = new Date();
  const [updated] = await tx.update(skillReleases).set({
    status: to,
    ...(to === "deprecated" ? { deprecatedAt: now } : { withdrawnAt: now }),
    revision: release.revision + 1,
    updatedAt: now,
  }).where(and(eq(skillReleases.id, release.id), eq(skillReleases.revision, release.revision))).returning();
  if (!updated) throw new Error("Locked Skill release disappeared during transition");
  return domainSuccess(updated);
}

export function deprecateSkillReleaseInTransaction(
  tx: SkillReleaseTransaction,
  input: z.output<typeof transitionSkillReleaseInputSchema>,
): Promise<DomainResult<SkillRelease>> {
  return transitionReleaseInTransaction(tx, input, "deprecated");
}

export function withdrawSkillReleaseInTransaction(
  tx: SkillReleaseTransaction,
  input: z.output<typeof transitionSkillReleaseInputSchema>,
): Promise<DomainResult<SkillRelease>> {
  return transitionReleaseInTransaction(tx, input, "withdrawn");
}

async function runReleaseTransition(
  input: TransitionSkillReleaseInput,
  actor: DomainActor,
  to: "deprecated" | "withdrawn",
): Promise<DomainResult<SkillRelease>> {
  const actorFailure = validateActor(actor);
  if (actorFailure) return actorFailure;
  const parsed = parseInput(transitionSkillReleaseInputSchema, input);
  if (!parsed.ok) return parsed;
  try {
    const result = await db.transaction((tx) => transitionReleaseInTransaction(tx, parsed.value, to));
    if (result.ok) expirePublicSiteCache("skills");
    return result;
  } catch (error) {
    return databaseFailure(error);
  }
}

export function deprecateSkillRelease(
  input: TransitionSkillReleaseInput,
  actor: DomainActor,
): Promise<DomainResult<SkillRelease>> {
  return runReleaseTransition(input, actor, "deprecated");
}

export function withdrawSkillRelease(
  input: TransitionSkillReleaseInput,
  actor: DomainActor,
): Promise<DomainResult<SkillRelease>> {
  return runReleaseTransition(input, actor, "withdrawn");
}

export async function withdrawSkillInTransaction(
  tx: SkillReleaseTransaction,
  input: z.output<typeof transitionSkillInputSchema>,
): Promise<DomainResult<Skill>> {
  const skill = await lockSkill(tx, input.skillId);
  if (!skill) return domainFailure("not-found", "Skill not found");
  if (skill.revision !== input.expectedRevision) {
    return domainFailure("stale-revision", "Skill was updated by another writer");
  }
  if (!canTransition("skill", skill.status, "withdrawn")) {
    return domainFailure("invalid-transition", `Cannot withdraw Skill from ${skill.status}`);
  }
  const now = new Date();
  const [updated] = await tx.update(skills).set({
    status: "withdrawn",
    withdrawnAt: now,
    revision: skill.revision + 1,
    updatedAt: now,
  }).where(and(eq(skills.id, skill.id), eq(skills.revision, skill.revision))).returning();
  if (!updated) throw new Error("Locked Skill disappeared during withdrawal");
  return domainSuccess(updated);
}

export async function withdrawSkill(
  input: TransitionSkillInput,
  actor: DomainActor,
): Promise<DomainResult<Skill>> {
  const actorFailure = validateActor(actor);
  if (actorFailure) return actorFailure;
  const parsed = parseInput(transitionSkillInputSchema, input);
  if (!parsed.ok) return parsed;
  try {
    const result = await db.transaction((tx) => withdrawSkillInTransaction(tx, parsed.value));
    if (result.ok) expirePublicSiteCache("skills");
    return result;
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function getAdminSkillProjection(skillId: string): Promise<DomainResult<AdminSkillProjection>> {
  try {
    const skill = await db.query.skills.findFirst({ where: eq(skills.id, skillId) });
    if (!skill) return domainFailure("not-found", "Skill not found");
    const releases = await db.query.skillReleases.findMany({
      where: eq(skillReleases.skillId, skill.id),
      orderBy: [desc(skillReleases.createdAt), desc(skillReleases.id)],
    });
    return domainSuccess({ skill, releases });
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function getAdminSkillRelease(releaseId: string): Promise<DomainResult<SkillRelease>> {
  try {
    const release = await db.query.skillReleases.findFirst({ where: eq(skillReleases.id, releaseId) });
    return release ? domainSuccess(release) : domainFailure("not-found", "Skill release not found");
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function listAdminSkills(): Promise<DomainResult<Skill[]>> {
  try {
    return domainSuccess(await db.select().from(skills).orderBy(desc(skills.updatedAt), desc(skills.id)));
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function getSkillReadiness(skillId: string): Promise<DomainResult<ReadinessResult>> {
  try {
    const skill = await db.query.skills.findFirst({ where: eq(skills.id, skillId) });
    return skill ? domainSuccess(validateSkillReadiness(skill)) : domainFailure("not-found", "Skill not found");
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function getSkillReleaseReadiness(
  releaseId: string,
  artifact?: SkillReleaseArtifactPrerequisites,
  storage?: StorageProvider,
): Promise<DomainResult<ReadinessResult>> {
  try {
    const release = await db.query.skillReleases.findFirst({ where: eq(skillReleases.id, releaseId) });
    if (!release) return domainFailure("not-found", "Skill release not found");
    const parent = await db.query.skills.findFirst({ where: eq(skills.id, release.skillId) });
    const duplicate = await db.query.skillReleases.findFirst({
      where: and(
        eq(skillReleases.skillId, release.skillId),
        eq(skillReleases.version, release.version),
        ne(skillReleases.id, release.id),
      ),
      columns: { id: true },
    });
    const resolvedArtifact = artifact === undefined
      ? parent?.distributionMode === "github"
        ? domainSuccess(undefined)
        : await getSkillReleaseArtifactPrerequisites(releaseId, storage)
      : domainSuccess(artifact);
    if (!resolvedArtifact.ok) return resolvedArtifact;
    return domainSuccess(validateSkillReleaseReadiness(release, {
      parentSkillExists: Boolean(parent),
      versionAvailable: !duplicate,
      distributionMode: parent?.distributionMode,
      artifact: resolvedArtifact.value,
    }));
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function getPublicSkillProjection(
  idOrSlug: string,
  viewer: { authenticated: boolean },
): Promise<DomainResult<PublicSkillProjection>> {
  try {
    const skill = await db.query.skills.findFirst({
      where: and(or(eq(skills.id, idOrSlug), eq(skills.slug, idOrSlug)), eq(skills.status, "published")),
    });
    if (!skill) return domainFailure("not-found", "Skill not found");
    const releases = await db.query.skillReleases.findMany({
      where: and(
        eq(skillReleases.skillId, skill.id),
        inArray(skillReleases.status, ["published", "deprecated"]),
      ),
      orderBy: [desc(skillReleases.publishedAt), desc(skillReleases.id)],
    });
    const projection = toPublicSkillProjection(skill, releases, viewer);
    return projection
      ? domainSuccess(projection)
      : domainFailure("not-found", "Skill has no visible current release");
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function getPublicSkillReleaseProjection(
  idOrSlug: string,
  version: string,
  viewer: { authenticated: boolean },
): Promise<DomainResult<PublicSkillReleaseProjection>> {
  try {
    const skill = await db.query.skills.findFirst({
      where: and(or(eq(skills.id, idOrSlug), eq(skills.slug, idOrSlug)), eq(skills.status, "published")),
    });
    if (!skill) return domainFailure("not-found", "Skill not found");

    const release = await db.query.skillReleases.findFirst({
      where: and(
        eq(skillReleases.skillId, skill.id),
        eq(skillReleases.version, version),
        inArray(skillReleases.status, ["published", "deprecated"]),
      ),
    });
    if (!release) return domainFailure("not-found", "Skill release not found");

    const distribution = toPublicSkillDistribution(skill);
    const projection = distribution
      ? toPublicSkillReleaseProjection(release, viewer, distribution)
      : null;
    return projection
      ? domainSuccess(projection)
      : domainFailure("not-found", "Skill release not found");
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function listPublicSkills(
  viewer: { authenticated: boolean },
): Promise<DomainResult<PublicSkillProjection[]>> {
  try {
    const publishedSkills = await db.query.skills.findMany({
      where: eq(skills.status, "published"),
      orderBy: [desc(skills.publishedAt), desc(skills.id)],
    });
    const projections: PublicSkillProjection[] = [];
    for (const skill of publishedSkills) {
      const releases = await db.query.skillReleases.findMany({
        where: and(
          eq(skillReleases.skillId, skill.id),
          inArray(skillReleases.status, ["published", "deprecated"]),
        ),
        orderBy: [desc(skillReleases.publishedAt), desc(skillReleases.id)],
      });
      const projection = toPublicSkillProjection(skill, releases, viewer);
      if (projection) projections.push(projection);
    }
    return domainSuccess(projections);
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function listPublicSkillSummaries(
  viewer: { authenticated: boolean },
): Promise<DomainResult<PublicSkillCollectionProjection[]>> {
  try {
    const publishedSkills = await db.query.skills.findMany({
      where: eq(skills.status, "published"),
      orderBy: [desc(skills.publishedAt), desc(skills.id)],
    });
    const projections: PublicSkillCollectionProjection[] = [];
    for (const skill of publishedSkills) {
      if (!skill.currentReleaseId) continue;
      const currentRelease = await db.query.skillReleases.findFirst({
        where: and(
          eq(skillReleases.id, skill.currentReleaseId),
          eq(skillReleases.skillId, skill.id),
          inArray(skillReleases.status, ["published", "deprecated"]),
        ),
        columns: {
          id: true,
          skillId: true,
          version: true,
          checksumSha256: true,
          compatibility: true,
          license: true,
          accessPolicy: true,
          status: true,
          publishedAt: true,
          deprecatedAt: true,
        },
      });
      const projection = toPublicSkillCollectionProjection(skill, currentRelease, viewer);
      if (projection) projections.push(projection);
    }
    return domainSuccess(projections);
  } catch (error) {
    return databaseFailure(error);
  }
}
