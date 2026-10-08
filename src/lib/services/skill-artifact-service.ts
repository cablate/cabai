import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, skillReleases, type SkillRelease } from "@/lib/db/schema";
import {
  StorageObjectNotFoundError,
  StorageProviderError,
  type StorageProvider,
} from "@/lib/storage/types";
import {
  SKILL_ARTIFACT_LIMITS,
  validateSkillArtifactArchive,
} from "@/lib/skill-artifacts/archive-validator";
import {
  domainFailure,
  domainSuccess,
  type DomainResult,
  type ReadinessIssue,
} from "./library-skill-information-domain";
import type {
  SkillReleaseArtifactPrerequisites,
} from "./skill-release-service";

const DOWNLOAD_TTL_SECONDS = 5 * 60;
const REPAIR_UPLOAD_TTL_SECONDS = 15 * 60;

async function resolveStorageProvider(storage?: StorageProvider): Promise<StorageProvider> {
  if (storage) return storage;
  return (await import("@/lib/storage")).getStorageProvider();
}

type MediaRecord = typeof media.$inferSelect;
type ArtifactManifest = NonNullable<SkillRelease["artifactManifest"]>;
type ArtifactValidation = NonNullable<SkillRelease["artifactValidation"]>;

interface ArtifactInspection {
  prerequisites: SkillReleaseArtifactPrerequisites;
  checksumSha256: string | null;
  manifest: ArtifactManifest | null;
  validation: ArtifactValidation;
  media: MediaRecord | null;
}

export interface BoundSkillArtifact {
  release: SkillRelease;
  prerequisites: SkillReleaseArtifactPrerequisites;
}

export interface SkillArtifactDownload {
  url: string;
  expiresIn: number;
  filename: string;
  contentType: string;
  contentLength: number;
  checksumSha256: string;
}

export interface SkillArtifactRepairTarget {
  signedUrl: string;
  expiresIn: number;
  storageKey: string;
  contentType: string;
  contentLength: number;
}

function issue(code: ReadinessIssue["code"], field: string, message: string): ReadinessIssue {
  return { code, field, message, severity: "error" };
}

function allVerified(evidence: SkillReleaseArtifactPrerequisites): boolean {
  return Object.values(evidence).every((state) => state === "verified");
}

function validationFailure(inspection: ArtifactInspection): ReturnType<typeof domainFailure> {
  const issues: ReadinessIssue[] = [];
  const storageUnavailable = inspection.prerequisites.storageHead === "unavailable"
    || inspection.prerequisites.checksum === "unavailable";
  if (inspection.prerequisites.binding !== "verified") {
    issues.push(issue("missing_artifact", "artifact.binding", "Skill artifact media binding is missing or invalid"));
  }
  if (inspection.prerequisites.storageHead !== "verified") {
    issues.push(issue(
      "missing_artifact",
      "artifact.storageHead",
      inspection.prerequisites.storageHead === "missing"
        ? "Skill artifact object is missing"
        : "Skill artifact object metadata could not be verified",
    ));
  }
  if (inspection.prerequisites.checksum !== "verified") {
    issues.push(issue(
      inspection.prerequisites.checksum === "invalid" ? "checksum_mismatch" : "missing_artifact",
      "artifact.checksum",
      "Skill artifact checksum could not be verified",
    ));
  }
  if (inspection.prerequisites.archive !== "verified") {
    issues.push(issue("invalid_format", "artifact.archive", "Skill artifact ZIP failed validation"));
  }
  return domainFailure(
    storageUnavailable ? "prerequisite-unavailable" : "validation-failed",
    "Skill artifact prerequisites are not satisfied",
    { retryable: storageUnavailable, issues },
  );
}

function emptyValidation(
  issues: ArtifactValidation["issues"],
  checksumSha256: string | null = null,
): ArtifactValidation {
  return { valid: false, issues, validatedChecksumSha256: checksumSha256 };
}

function manifestsEqual(left: ArtifactManifest, right: ArtifactManifest): boolean {
  return left.skillMarkdownSha256 === right.skillMarkdownSha256
    && left.name === right.name
    && left.description === right.description
    && left.fileCount === right.fileCount
    && left.uncompressedBytes === right.uncompressedBytes
    && left.paths.length === right.paths.length
    && left.paths.every((path, index) => path === right.paths[index]);
}

async function inspectArtifact(
  release: SkillRelease,
  record: MediaRecord | null,
  storage: StorageProvider,
): Promise<ArtifactInspection> {
  const prerequisites: SkillReleaseArtifactPrerequisites = {
    binding: "missing",
    storageHead: "missing",
    checksum: "missing",
    archive: "missing",
  };

  const bindingMatches = Boolean(
    record
      && release.artifactMediaId === record.id
      && record.status === "confirmed"
      && record.context === "skill-artifact"
      && record.entityType === "skillRelease"
      && record.entityId === release.id,
  );
  if (!bindingMatches || !record) {
    return {
      prerequisites,
      checksumSha256: null,
      manifest: null,
      validation: emptyValidation([{ code: "invalid_binding", message: "Artifact media binding is invalid" }]),
      media: record,
    };
  }
  prerequisites.binding = "verified";

  try {
    const metadata = await storage.head(record.storageKey);
    const actualType = metadata.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (metadata.contentLength !== record.fileSize || actualType !== record.mimeType.toLowerCase()) {
      prerequisites.storageHead = "invalid";
      return {
        prerequisites,
        checksumSha256: null,
        manifest: null,
        validation: emptyValidation([{ code: "metadata_mismatch", message: "Stored object metadata differs from the media registry" }]),
        media: record,
      };
    }
    prerequisites.storageHead = "verified";
  } catch (error) {
    prerequisites.storageHead = error instanceof StorageObjectNotFoundError ? "missing" : "unavailable";
    return {
      prerequisites,
      checksumSha256: null,
      manifest: null,
      validation: emptyValidation([{
        code: error instanceof StorageObjectNotFoundError ? "missing_object" : "storage_unavailable",
        message: error instanceof Error ? error.message : "Storage object inspection failed",
      }]),
      media: record,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = await storage.readObject(record.storageKey, SKILL_ARTIFACT_LIMITS.compressedBytes);
  } catch (error) {
    if (error instanceof StorageObjectNotFoundError) {
      prerequisites.storageHead = "missing";
      prerequisites.checksum = "missing";
    } else if (error instanceof StorageProviderError && error.code === "OBJECT_TOO_LARGE") {
      prerequisites.checksum = "invalid";
    } else {
      prerequisites.checksum = "unavailable";
    }
    return {
      prerequisites,
      checksumSha256: null,
      manifest: null,
      validation: emptyValidation([{
        code: error instanceof StorageProviderError ? error.code.toLowerCase() : "storage_unavailable",
        message: error instanceof Error ? error.message : "Stored object could not be read",
      }]),
      media: record,
    };
  }

  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  prerequisites.checksum = release.checksumSha256 === null || release.checksumSha256 === checksumSha256
    ? "verified"
    : "invalid";

  const archive = validateSkillArtifactArchive(bytes);
  if (!archive.ok) {
    prerequisites.archive = "invalid";
    return {
      prerequisites,
      checksumSha256,
      manifest: null,
      validation: emptyValidation(archive.issues, checksumSha256),
      media: record,
    };
  }

  const manifestMatchesStored = release.artifactManifest === null
    || manifestsEqual(release.artifactManifest, archive.value.manifest);
  const storedValidationPresent = release.status === "draft"
    || (
      release.artifactValidation?.valid === true
      && release.artifactValidatedAt !== null
      && release.checksumSha256 !== null
      && release.artifactValidation.validatedChecksumSha256 === release.checksumSha256
    );
  prerequisites.archive = manifestMatchesStored && storedValidationPresent ? "verified" : "invalid";

  return {
    prerequisites,
    checksumSha256,
    manifest: archive.value.manifest,
    validation: {
      valid: prerequisites.archive === "verified",
      issues: prerequisites.archive === "verified"
        ? []
        : [{ code: "stored_evidence_mismatch", message: "Stored artifact evidence does not match the object" }],
      validatedChecksumSha256: checksumSha256,
    },
    media: record,
  };
}

async function loadReleaseAndMedia(releaseId: string): Promise<{
  release: SkillRelease | null;
  media: MediaRecord | null;
}> {
  const release = await db.query.skillReleases.findFirst({ where: eq(skillReleases.id, releaseId) });
  if (!release?.artifactMediaId) return { release: release ?? null, media: null };
  const record = await db.query.media.findFirst({ where: eq(media.id, release.artifactMediaId) });
  return { release, media: record ?? null };
}

export async function bindAndValidateDraftSkillArtifact(input: {
  releaseId: string;
  mediaId: string;
  expectedRevision: number;
}, storage?: StorageProvider): Promise<DomainResult<BoundSkillArtifact>> {
  const [release, record] = await Promise.all([
    db.query.skillReleases.findFirst({ where: eq(skillReleases.id, input.releaseId) }),
    db.query.media.findFirst({ where: eq(media.id, input.mediaId) }),
  ]);
  if (!release || !record) return domainFailure("not-found", "Skill release or media was not found");
  if (release.status !== "draft") return domainFailure("immutable", "Published Skill release artifacts cannot be rebound");
  if (
    record.status !== "confirmed"
    || record.context !== "skill-artifact"
    || record.entityType !== "skillRelease"
    || record.entityId !== release.id
  ) return domainFailure("validation-failed", "Media is not a confirmed Skill release artifact");

  const provider = await resolveStorageProvider(storage);
  if (release.artifactMediaId === record.id) {
    const existingInspection = await inspectArtifact(release, record, provider);
    return allVerified(existingInspection.prerequisites)
      ? domainSuccess({ release, prerequisites: existingInspection.prerequisites })
      : validationFailure(existingInspection);
  }
  if (release.revision !== input.expectedRevision) {
    return domainFailure("stale-revision", "Skill release was updated by another writer");
  }

  const candidateRelease = {
    ...release,
    artifactMediaId: record.id,
    checksumSha256: null,
    artifactManifest: null,
    artifactValidation: null,
    artifactValidatedAt: null,
  };
  const inspection = await inspectArtifact(candidateRelease, record, provider);
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(skillReleases).set({
      artifactMediaId: record.id,
      checksumSha256: inspection.checksumSha256,
      artifactManifest: inspection.manifest,
      artifactValidation: inspection.validation,
      artifactValidatedAt: now,
      revision: release.revision + 1,
      updatedAt: now,
    }).where(and(
      eq(skillReleases.id, release.id),
      eq(skillReleases.status, "draft"),
      eq(skillReleases.revision, release.revision),
    )).returning();
    if (!row) return undefined;
    if (release.artifactMediaId && release.artifactMediaId !== record.id) {
      await tx.update(media).set({ status: "orphaned", entityType: null, entityId: null })
        .where(and(eq(media.id, release.artifactMediaId), eq(media.status, "confirmed")));
    }
    return row;
  });

  if (!updated) return domainFailure("stale-revision", "Skill release artifact binding lost a concurrent update");
  if (!allVerified(inspection.prerequisites)) return validationFailure(inspection);
  return domainSuccess({ release: updated, prerequisites: inspection.prerequisites });
}

export async function getSkillReleaseArtifactPrerequisites(
  releaseId: string,
  storage?: StorageProvider,
): Promise<DomainResult<SkillReleaseArtifactPrerequisites>> {
  const loaded = await loadReleaseAndMedia(releaseId);
  if (!loaded.release) return domainFailure("not-found", "Skill release not found");
  const inspection = await inspectArtifact(loaded.release, loaded.media, await resolveStorageProvider(storage));
  return domainSuccess(inspection.prerequisites);
}

export async function createSkillArtifactDownload(input: {
  releaseId: string;
  authenticated: boolean;
}, storage?: StorageProvider): Promise<DomainResult<SkillArtifactDownload>> {
  const loaded = await loadReleaseAndMedia(input.releaseId);
  const release = loaded.release;
  if (!release || (release.status !== "published" && release.status !== "deprecated")) {
    return domainFailure("not-found", "Downloadable Skill release not found");
  }
  if (release.accessPolicy === "authenticated" && !input.authenticated) {
    return domainFailure("forbidden", "This Skill release requires authentication");
  }
  const provider = await resolveStorageProvider(storage);
  const inspection = await inspectArtifact(release, loaded.media, provider);
  if (!allVerified(inspection.prerequisites) || !loaded.media || !release.checksumSha256) {
    return validationFailure(inspection);
  }
  const url = await provider.createDownloadTarget(loaded.media.storageKey, DOWNLOAD_TTL_SECONDS);
  return domainSuccess({
    url,
    expiresIn: DOWNLOAD_TTL_SECONDS,
    filename: loaded.media.filename,
    contentType: loaded.media.mimeType,
    contentLength: loaded.media.fileSize,
    checksumSha256: release.checksumSha256,
  });
}

export async function createMissingSkillArtifactRepairTarget(
  releaseId: string,
  storage?: StorageProvider,
): Promise<DomainResult<SkillArtifactRepairTarget>> {
  const loaded = await loadReleaseAndMedia(releaseId);
  const release = loaded.release;
  if (!release || !loaded.media || (release.status !== "published" && release.status !== "deprecated")) {
    return domainFailure("not-found", "Repairable Skill release not found");
  }
  const provider = await resolveStorageProvider(storage);
  try {
    await provider.head(loaded.media.storageKey);
    return domainFailure("conflict", "Skill artifact object is not missing");
  } catch (error) {
    if (!(error instanceof StorageObjectNotFoundError)) {
      return domainFailure("prerequisite-unavailable", "Storage availability could not be verified", { retryable: true });
    }
  }
  const signedUrl = await provider.createUploadTarget({
    key: loaded.media.storageKey,
    contentType: loaded.media.mimeType,
    contentLength: loaded.media.fileSize,
    expiresIn: REPAIR_UPLOAD_TTL_SECONDS,
  });
  return domainSuccess({
    signedUrl,
    expiresIn: REPAIR_UPLOAD_TTL_SECONDS,
    storageKey: loaded.media.storageKey,
    contentType: loaded.media.mimeType,
    contentLength: loaded.media.fileSize,
  });
}

export async function confirmMissingSkillArtifactRepair(
  releaseId: string,
  storage?: StorageProvider,
): Promise<DomainResult<SkillReleaseArtifactPrerequisites>> {
  const loaded = await loadReleaseAndMedia(releaseId);
  if (!loaded.release || !loaded.media) return domainFailure("not-found", "Skill release artifact not found");
  if (loaded.release.status !== "published" && loaded.release.status !== "deprecated") {
    return domainFailure("immutable", "Only a published or deprecated release can repair its immutable artifact");
  }
  const provider = await resolveStorageProvider(storage);
  const inspection = await inspectArtifact(loaded.release, loaded.media, provider);
  if (allVerified(inspection.prerequisites)) return domainSuccess(inspection.prerequisites);
  const replacementWasDeterministicallyRejected = inspection.prerequisites.storageHead === "invalid"
    || (
      inspection.prerequisites.storageHead === "verified"
      && (inspection.prerequisites.checksum === "invalid" || inspection.prerequisites.archive === "invalid")
    );
  if (replacementWasDeterministicallyRejected) {
    await provider.delete(loaded.media.storageKey).catch(() => undefined);
  }
  return validationFailure(inspection);
}

export async function abandonDraftSkillArtifact(input: {
  releaseId: string;
  expectedRevision: number;
}): Promise<DomainResult<SkillRelease>> {
  const release = await db.query.skillReleases.findFirst({ where: eq(skillReleases.id, input.releaseId) });
  if (!release) return domainFailure("not-found", "Skill release not found");
  if (release.status !== "draft") return domainFailure("immutable", "Published Skill artifacts cannot be abandoned");
  if (release.revision !== input.expectedRevision) {
    return domainFailure("stale-revision", "Skill release was updated by another writer");
  }
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx.update(skillReleases).set({
      artifactMediaId: null,
      checksumSha256: null,
      artifactManifest: null,
      artifactValidation: null,
      artifactValidatedAt: null,
      revision: release.revision + 1,
      updatedAt: now,
    }).where(and(
      eq(skillReleases.id, release.id),
      eq(skillReleases.status, "draft"),
      eq(skillReleases.revision, release.revision),
    )).returning();
    if (!row) return null;
    if (release.artifactMediaId) {
      await tx.update(media).set({ status: "orphaned", entityType: null, entityId: null })
        .where(and(eq(media.id, release.artifactMediaId), eq(media.status, "confirmed")));
    }
    return row;
  });
  return updated
    ? domainSuccess(updated)
    : domainFailure("stale-revision", "Skill release artifact cleanup lost a concurrent update");
}
