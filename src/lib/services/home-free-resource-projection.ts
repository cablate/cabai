import type { Plan, PlanPresentation } from "@/lib/db/schema";
import { planPath } from "@/lib/plan-url";
import type { LibraryPublicSummary } from "./library-service";
import type { PublicSkillProjection } from "./skill-release-service";

export type HomeFreeResourceTarget =
  | "products"
  | "library-reauthor"
  | "skills"
  | "suppress";

export type LegacyHomeFreeResourceOwner =
  | "plan"
  | "course"
  | "event"
  | "download"
  | "service"
  | "membership";

export type HomeFreeResourceReasonCode =
  | "legacy-domain-retained"
  | "zero-price-plan-retained"
  | "owner-override";

export interface LegacyHomeFreeResource {
  plan: Pick<Plan, "id" | "slug" | "name" | "amount">;
  presentation: Pick<
    PlanPresentation,
    "id" | "offeringType" | "title" | "subtitle" | "description"
  >;
}

export interface HomeLibraryProjection
  extends Pick<LibraryPublicSummary, "id" | "slug" | "title" | "summary"> {
  sourceLegacyPlanIds?: readonly string[];
}

export interface HomeSkillProjection
  extends Pick<PublicSkillProjection, "id" | "slug" | "title" | "summary"> {
  sourceLegacyPlanIds?: readonly string[];
}

export interface HomeFreeResourceOwnerOverride {
  target: HomeFreeResourceTarget;
  reason: string;
}

export interface HomeFreeResourceDuplicate {
  kind: "legacy" | "library" | "skill";
  id: string;
  title: string;
  publicUrl: string;
  basis: "normalized-title" | "source-plan";
}

export interface HomeFreeResourceClassification {
  legacyPlanId: string;
  presentationId: string;
  title: string;
  originalOwner: LegacyHomeFreeResourceOwner;
  originalPublicUrl: string;
  suggestedTarget: HomeFreeResourceTarget;
  effectiveTarget: HomeFreeResourceTarget;
  reason: {
    code: HomeFreeResourceReasonCode;
    message: string;
  };
  ownerOverride: HomeFreeResourceOwnerOverride | null;
  duplicates: HomeFreeResourceDuplicate[];
}

export interface HomeFreeResourceClassificationPreview {
  rows: HomeFreeResourceClassification[];
  counts: Record<HomeFreeResourceTarget, number>;
  duplicatePlanIds: string[];
}

export interface HomeFreeResourceClassificationOptions {
  ownerOverrides?: Readonly<Record<string, HomeFreeResourceOwnerOverride>>;
  libraries?: readonly HomeLibraryProjection[];
  skills?: readonly HomeSkillProjection[];
}

export interface HomeFreeResourceShadowItem {
  key: string;
  owner: "products" | "library" | "skills";
  id: string;
  title: string;
  publicUrl: string;
}

export interface HomeFreeResourceShadowResult {
  legacy: HomeFreeResourceShadowItem[];
  projected: HomeFreeResourceShadowItem[];
  comparison: {
    status: "match" | "intentional-change" | "mismatch";
    preservedPlanIds: string[];
    reclassifiedPlanIds: string[];
    suppressedPlanIds: string[];
    missingPlanIds: string[];
    addedCanonicalKeys: string[];
    duplicatePublicUrls: string[];
  };
}

export interface HomeFreeResourceShadowInput {
  preview: HomeFreeResourceClassificationPreview;
  libraries?: readonly HomeLibraryProjection[];
  skills?: readonly HomeSkillProjection[];
}

const FREE_OFFERING_TYPES = new Set<PlanPresentation["offeringType"]>([
  "free_event",
  "download",
]);

export function isLegacyHomeFreeResource(item: LegacyHomeFreeResource): boolean {
  return FREE_OFFERING_TYPES.has(item.presentation.offeringType) || item.plan.amount === 0;
}

function originalOwnerFor(
  offeringType: PlanPresentation["offeringType"],
): LegacyHomeFreeResourceOwner {
  switch (offeringType) {
    case "course":
      return "course";
    case "lecture":
    case "free_event":
    case "offline_event":
      return "event";
    case "download":
      return "download";
    case "service":
      return "service";
    case "membership":
      return "membership";
    default:
      return "plan";
  }
}

function normalizedTitle(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function libraryUrl(entry: Pick<HomeLibraryProjection, "slug">): string {
  return `/library/${entry.slug}`;
}

function skillUrl(skill: Pick<HomeSkillProjection, "slug">): string {
  return `/skills/${skill.slug}`;
}

function canonicalDuplicate(
  planId: string,
  title: string,
  candidate: HomeLibraryProjection | HomeSkillProjection,
): "normalized-title" | "source-plan" | null {
  if (candidate.sourceLegacyPlanIds?.includes(planId)) return "source-plan";
  return normalizedTitle(candidate.title) === normalizedTitle(title)
    ? "normalized-title"
    : null;
}

function defaultReason(item: LegacyHomeFreeResource): HomeFreeResourceClassification["reason"] {
  if (!FREE_OFFERING_TYPES.has(item.presentation.offeringType) && item.plan.amount === 0) {
    return {
      code: "zero-price-plan-retained",
      message: "Zero price makes this a legacy home candidate, but its Plan domain and public URL remain authoritative.",
    };
  }
  return {
    code: "legacy-domain-retained",
    message: "The legacy offering remains owned by its existing domain unless the owner approves a reclassification.",
  };
}

function duplicateReferences(
  item: LegacyHomeFreeResource,
  legacyItems: readonly LegacyHomeFreeResource[],
  libraries: readonly HomeLibraryProjection[],
  skills: readonly HomeSkillProjection[],
): HomeFreeResourceDuplicate[] {
  const titleKey = normalizedTitle(item.presentation.title);
  const legacyMatches: HomeFreeResourceDuplicate[] = legacyItems
    .filter((candidate) => (
      candidate.plan.id !== item.plan.id &&
      normalizedTitle(candidate.presentation.title) === titleKey
    ))
    .map((candidate) => ({
      kind: "legacy" as const,
      id: candidate.plan.id,
      title: candidate.presentation.title,
      publicUrl: planPath(candidate.plan, "product"),
      basis: "normalized-title" as const,
    }));
  const libraryMatches: HomeFreeResourceDuplicate[] = libraries.flatMap((candidate) => {
    const basis = canonicalDuplicate(item.plan.id, item.presentation.title, candidate);
    return basis ? [{
      kind: "library" as const,
      id: candidate.id,
      title: candidate.title,
      publicUrl: libraryUrl(candidate),
      basis,
    }] : [];
  });
  const skillMatches: HomeFreeResourceDuplicate[] = skills.flatMap((candidate) => {
    const basis = canonicalDuplicate(item.plan.id, item.presentation.title, candidate);
    return basis ? [{
      kind: "skill" as const,
      id: candidate.id,
      title: candidate.title,
      publicUrl: skillUrl(candidate),
      basis,
    }] : [];
  });
  return [...legacyMatches, ...libraryMatches, ...skillMatches];
}

export function classifyHomeFreeResources(
  items: readonly LegacyHomeFreeResource[],
  options: HomeFreeResourceClassificationOptions = {},
): HomeFreeResourceClassificationPreview {
  const legacyItems = items.filter(isLegacyHomeFreeResource);
  const libraries = options.libraries ?? [];
  const skills = options.skills ?? [];
  const rows = legacyItems.map((item): HomeFreeResourceClassification => {
    const ownerOverride = options.ownerOverrides?.[item.plan.id] ?? null;
    if (ownerOverride !== null && ownerOverride.reason.trim().length === 0) {
      throw new Error(`Owner override for Plan ${item.plan.id} requires a reason.`);
    }
    return {
      legacyPlanId: item.plan.id,
      presentationId: item.presentation.id,
      title: item.presentation.title,
      originalOwner: originalOwnerFor(item.presentation.offeringType),
      originalPublicUrl: planPath(item.plan, "product"),
      suggestedTarget: "products",
      effectiveTarget: ownerOverride?.target ?? "products",
      reason: ownerOverride
        ? { code: "owner-override", message: ownerOverride.reason.trim() }
        : defaultReason(item),
      ownerOverride,
      duplicates: duplicateReferences(item, legacyItems, libraries, skills),
    };
  });
  const counts: Record<HomeFreeResourceTarget, number> = {
    products: 0,
    "library-reauthor": 0,
    skills: 0,
    suppress: 0,
  };
  for (const row of rows) counts[row.effectiveTarget] += 1;
  return {
    rows,
    counts,
    duplicatePlanIds: rows.filter((row) => row.duplicates.length > 0).map((row) => row.legacyPlanId),
  };
}

function canonicalMatch(
  row: HomeFreeResourceClassification,
  candidates: readonly (HomeLibraryProjection | HomeSkillProjection)[],
): HomeLibraryProjection | HomeSkillProjection | undefined {
  return candidates.find((candidate) => (
    canonicalDuplicate(row.legacyPlanId, row.title, candidate) !== null
  ));
}

function duplicateUrls(items: readonly HomeFreeResourceShadowItem[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.publicUrl, (counts.get(item.publicUrl) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([url]) => url);
}

export function buildHomeFreeResourceShadow(
  input: HomeFreeResourceShadowInput,
): HomeFreeResourceShadowResult {
  const libraries = input.libraries ?? [];
  const skills = input.skills ?? [];
  const legacy = input.preview.rows.map((row): HomeFreeResourceShadowItem => ({
    key: `product:${row.legacyPlanId}`,
    owner: "products",
    id: row.legacyPlanId,
    title: row.title,
    publicUrl: row.originalPublicUrl,
  }));
  const productRows = input.preview.rows.filter((row) => row.effectiveTarget === "products");
  const projected: HomeFreeResourceShadowItem[] = [
    ...productRows.map((row): HomeFreeResourceShadowItem => ({
      key: `product:${row.legacyPlanId}`,
      owner: "products",
      id: row.legacyPlanId,
      title: row.title,
      publicUrl: row.originalPublicUrl,
    })),
    ...libraries.map((entry): HomeFreeResourceShadowItem => ({
      key: `library:${entry.id}`,
      owner: "library",
      id: entry.id,
      title: entry.title,
      publicUrl: libraryUrl(entry),
    })),
    ...skills.map((skill): HomeFreeResourceShadowItem => ({
      key: `skill:${skill.id}`,
      owner: "skills",
      id: skill.id,
      title: skill.title,
      publicUrl: skillUrl(skill),
    })),
  ];

  const preservedPlanIds = productRows.map((row) => row.legacyPlanId);
  const reclassifiedPlanIds: string[] = [];
  const suppressedPlanIds: string[] = [];
  const missingPlanIds: string[] = [];
  const matchedCanonicalKeys = new Set<string>();
  for (const row of input.preview.rows) {
    if (row.effectiveTarget === "products") continue;
    if (row.effectiveTarget === "suppress") {
      suppressedPlanIds.push(row.legacyPlanId);
      continue;
    }
    const isLibrary = row.effectiveTarget === "library-reauthor";
    const match = canonicalMatch(row, isLibrary ? libraries : skills);
    if (!match) {
      missingPlanIds.push(row.legacyPlanId);
      continue;
    }
    reclassifiedPlanIds.push(row.legacyPlanId);
    matchedCanonicalKeys.add(`${isLibrary ? "library" : "skill"}:${match.id}`);
  }
  const addedCanonicalKeys = projected
    .filter((item) => item.owner !== "products" && !matchedCanonicalKeys.has(item.key))
    .map((item) => item.key);
  const duplicatePublicUrls = duplicateUrls(projected);
  const status = missingPlanIds.length > 0 || duplicatePublicUrls.length > 0
    ? "mismatch"
    : reclassifiedPlanIds.length > 0 || suppressedPlanIds.length > 0 || addedCanonicalKeys.length > 0
      ? "intentional-change"
      : "match";

  return {
    legacy,
    projected,
    comparison: {
      status,
      preservedPlanIds,
      reclassifiedPlanIds,
      suppressedPlanIds,
      missingPlanIds,
      addedCanonicalKeys,
      duplicatePublicUrls,
    },
  };
}
