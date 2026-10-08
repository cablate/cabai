import { canonicalJson, fingerprint } from "./canonical";
import {
  type CourseExportChapter,
  type CourseExportLesson,
  type CourseExportV1,
  type CourseImportBudgets,
  type CourseImportPlan,
  type CourseImportPlanItem,
  type CourseImportRepository,
  type ExistingImportEntity,
  type ImportAction,
  type ImportEntityKind,
} from "./types";
import { DEFAULT_COURSE_IMPORT_BUDGETS, validateCourseExport } from "./validation";

export function parseCourseExport(
  input: string | unknown,
  budgets: Partial<CourseImportBudgets> = {},
): CourseExportV1 {
  const effective = { ...DEFAULT_COURSE_IMPORT_BUDGETS, ...budgets };
  let value = input;
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > effective.maxDocumentBytes) {
      throw new Error("Course export document size budget exceeded.");
    }
    try {
      value = JSON.parse(input);
    } catch (error) {
      throw new Error("Course export is not valid JSON.", { cause: error });
    }
  } else if (Buffer.byteLength(canonicalJson(input), "utf8") > effective.maxDocumentBytes) {
    throw new Error("Course export document size budget exceeded.");
  }
  return validateCourseExport(value, effective);
}

interface EntityProjection {
  kind: ImportEntityKind;
  logicalId: string;
  value: CourseExportV1["course"] | CourseExportChapter | CourseExportLesson | CourseExportV1["assets"][number];
}

function entities(manifest: CourseExportV1): EntityProjection[] {
  return [
    { kind: "course", logicalId: manifest.course.logicalId, value: manifest.course },
    ...manifest.course.chapters.flatMap((chapter) => [
      { kind: "chapter" as const, logicalId: chapter.logicalId, value: chapter },
      ...chapter.lessons.map((lesson) => ({ kind: "lesson" as const, logicalId: lesson.logicalId, value: lesson })),
    ]),
    ...manifest.assets.map((asset) => ({ kind: "asset" as const, logicalId: asset.logicalId, value: asset })),
  ];
}

function actionFor(existing: ExistingImportEntity | undefined, nextFingerprint: string, overwriteExisting: boolean): ImportAction {
  if (!existing) return "create";
  if (existing.fingerprint === nextFingerprint) return "skip";
  return overwriteExisting ? "update" : "conflict";
}

export function planCourseImport(
  manifestInput: CourseExportV1,
  existing: ExistingImportEntity[],
  options: { overwriteExisting?: boolean } = {},
): CourseImportPlan {
  const manifest = validateCourseExport(manifestInput);
  const byIdentity = new Map<string, ExistingImportEntity>();
  for (const item of existing) {
    const key = `${item.kind}:${item.logicalId}`;
    if (byIdentity.has(key)) throw new Error(`Duplicate existing import identity ${key}.`);
    byIdentity.set(key, item);
  }
  const items = entities(manifest).map(({ kind, logicalId, value }): CourseImportPlanItem => {
    const entityFingerprint = fingerprint(value);
    return {
      kind,
      logicalId,
      fingerprint: entityFingerprint,
      action: actionFor(byIdentity.get(`${kind}:${logicalId}`), entityFingerprint, options.overwriteExisting === true),
    };
  });
  const counts: Record<ImportAction, number> = { create: 0, update: 0, conflict: 0, skip: 0 };
  for (const item of items) counts[item.action] += 1;
  return { schema: manifest.schema, manifestFingerprint: fingerprint(manifest), items, counts, manifest };
}

export async function applyCourseImportPlan(
  plan: CourseImportPlan,
  repository: CourseImportRepository,
): Promise<{ applied: number; skipped: number }> {
  const manifest = validateCourseExport(plan.manifest);
  if (fingerprint(manifest) !== plan.manifestFingerprint) {
    throw new Error("Course import plan manifest fingerprint does not match.");
  }
  const expectedEntities = new Map(entities(manifest).map((entity) => [
    `${entity.kind}:${entity.logicalId}`,
    fingerprint(entity.value),
  ]));
  const seen = new Set<string>();
  for (const item of plan.items) {
    const key = `${item.kind}:${item.logicalId}`;
    if (seen.has(key) || expectedEntities.get(key) !== item.fingerprint) {
      throw new Error("Course import plan item integrity check failed.");
    }
    seen.add(key);
  }
  if (seen.size !== expectedEntities.size) {
    throw new Error("Course import plan is missing manifest entities.");
  }
  if (plan.items.some((item) => item.action === "conflict")) {
    throw new Error("Course import plan contains unresolved conflicts.");
  }
  const writable = plan.items.filter((item) => item.action === "create" || item.action === "update");
  await repository.transaction(async (writer) => {
    for (const item of writable) await writer.apply(item, plan.manifest);
  });
  return { applied: writable.length, skipped: plan.counts.skip };
}
