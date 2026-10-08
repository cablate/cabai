import {
  COURSE_EXPORT_SCHEMA,
  type CourseImportBudgets,
  type CourseExportV1,
} from "./types";

export const DEFAULT_COURSE_IMPORT_BUDGETS: CourseImportBudgets = {
  maxDocumentBytes: 2 * 1024 * 1024,
  maxAssetBytes: 512 * 1024 * 1024,
  maxTotalAssetBytes: 2 * 1024 * 1024 * 1024,
  maxEntities: 10_000,
};

type RecordValue = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new Error(`Invalid course export at ${path}: ${message}`);
}

function record(value: unknown, path: string, keys: readonly string[]): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected object");
  const result = value as RecordValue;
  const unknown = Object.keys(result).filter((key) => !keys.includes(key));
  if (unknown.length) fail(path, `unknown field ${unknown[0]}`);
  return result;
}

function string(value: unknown, path: string, max = 100_000): string {
  if (typeof value !== "string" || !value.length || value.length > max) fail(path, "expected bounded non-empty string");
  return value;
}

function nullableString(value: unknown, path: string, max = 100_000): string | null {
  return value === null ? null : string(value, path, max);
}

function integer(value: unknown, path: string, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min) fail(path, `expected safe integer >= ${min}`);
  return value as number;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "expected boolean");
  return value;
}

function oneOf<T extends string>(value: unknown, path: string, values: readonly T[]): T {
  if (typeof value !== "string" || !values.includes(value as T)) fail(path, `expected one of ${values.join(", ")}`);
  return value as T;
}

function logicalId(value: unknown, path: string): string {
  const id = string(value, path, 200);
  if (/[/\\\u0000-\u001f\u007f]/.test(id) || id === "." || id === "..") fail(path, "unsafe logical ID");
  return id;
}

function safeAssetPath(value: unknown, path: string): string {
  const candidate = string(value, path, 500);
  if (candidate.includes("\\") || candidate.includes("?") || candidate.includes("#") || candidate.startsWith("/")) fail(path, "unsafe asset path");
  let decoded = candidate;
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    fail(path, "invalid percent encoding");
  }
  const segments = decoded.split("/");
  if (segments[0] !== "assets" || segments.length < 2 || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    fail(path, "asset path must be a safe descendant of assets/");
  }
  return candidate;
}

function unique(id: string, seen: Set<string>, path: string) {
  if (seen.has(id)) fail(path, `duplicate logical ID ${id}`);
  seen.add(id);
}

export function validateCourseExport(value: unknown, budgets: CourseImportBudgets = DEFAULT_COURSE_IMPORT_BUDGETS): CourseExportV1 {
  const root = record(value, "$", ["schema", "exportedAt", "sourceIdentity", "course", "assets"]);
  if (root.schema !== COURSE_EXPORT_SCHEMA) fail("$.schema", "unsupported version");
  const exportedAt = string(root.exportedAt, "$.exportedAt", 50);
  if (Number.isNaN(Date.parse(exportedAt))) fail("$.exportedAt", "expected ISO timestamp");
  if (root.sourceIdentity !== "database-id") fail("$.sourceIdentity", "unsupported identity source");

  const seen = new Set<string>();
  const courseRaw = record(root.course, "$.course", ["logicalId", "title", "description", "order", "publicationIntent", "imageAssetLogicalId", "chapters"]);
  const courseId = logicalId(courseRaw.logicalId, "$.course.logicalId");
  unique(courseId, seen, "$.course.logicalId");
  if (!Array.isArray(courseRaw.chapters)) fail("$.course.chapters", "expected array");

  let entityCount = 1;
  const chapters = courseRaw.chapters.map((chapterValue, chapterIndex) => {
    const path = `$.course.chapters[${chapterIndex}]`;
    const chapter = record(chapterValue, path, ["logicalId", "title", "order", "defaultExpanded", "lessons"]);
    const chapterId = logicalId(chapter.logicalId, `${path}.logicalId`);
    unique(chapterId, seen, `${path}.logicalId`);
    if (!Array.isArray(chapter.lessons)) fail(`${path}.lessons`, "expected array");
    entityCount += 1;
    const lessons = chapter.lessons.map((lessonValue, lessonIndex) => {
      const lessonPath = `${path}.lessons[${lessonIndex}]`;
      const lesson = record(lessonValue, lessonPath, ["logicalId", "chapterLogicalId", "title", "type", "content", "duration", "order", "isPreview", "publicationIntent", "assetLogicalIds", "resources"]);
      const lessonId = logicalId(lesson.logicalId, `${lessonPath}.logicalId`);
      unique(lessonId, seen, `${lessonPath}.logicalId`);
      if (lesson.chapterLogicalId !== chapterId) fail(`${lessonPath}.chapterLogicalId`, "does not match containing chapter");
      if (!Array.isArray(lesson.assetLogicalIds) || !Array.isArray(lesson.resources)) fail(lessonPath, "assetLogicalIds and resources must be arrays");
      entityCount += 1;
      const resourceIds = new Set<string>();
      const resources = lesson.resources.map((resourceValue, resourceIndex) => {
        const resourcePath = `${lessonPath}.resources[${resourceIndex}]`;
        const resource = record(resourceValue, resourcePath, ["logicalId", "type", "title", "order", "url", "assetLogicalId"]);
        const resourceId = logicalId(resource.logicalId, `${resourcePath}.logicalId`);
        unique(resourceId, resourceIds, `${resourcePath}.logicalId`);
        unique(resourceId, seen, `${resourcePath}.logicalId`);
        entityCount += 1;
        const url = resource.url === undefined ? undefined : string(resource.url, `${resourcePath}.url`, 10_000);
        const assetLogicalId = resource.assetLogicalId === undefined ? undefined : logicalId(resource.assetLogicalId, `${resourcePath}.assetLogicalId`);
        if ((url ? 1 : 0) + (assetLogicalId ? 1 : 0) !== 1) fail(resourcePath, "exactly one of url or assetLogicalId is required");
        return {
          logicalId: resourceId,
          type: oneOf(resource.type, `${resourcePath}.type`, ["video", "pdf", "download", "link"] as const),
          title: string(resource.title, `${resourcePath}.title`, 500),
          order: integer(resource.order, `${resourcePath}.order`),
          ...(url ? { url } : {}),
          ...(assetLogicalId ? { assetLogicalId } : {}),
        };
      });
      return {
        logicalId: lessonId,
        chapterLogicalId: chapterId,
        title: string(lesson.title, `${lessonPath}.title`, 500),
        type: oneOf(lesson.type, `${lessonPath}.type`, ["video", "text", "pdf", "download"] as const),
        content: string(lesson.content, `${lessonPath}.content`),
        duration: lesson.duration === null ? null : integer(lesson.duration, `${lessonPath}.duration`),
        order: integer(lesson.order, `${lessonPath}.order`),
        isPreview: bool(lesson.isPreview, `${lessonPath}.isPreview`),
        publicationIntent: oneOf(lesson.publicationIntent, `${lessonPath}.publicationIntent`, ["draft", "published"] as const),
        assetLogicalIds: lesson.assetLogicalIds.map((id, index) => logicalId(id, `${lessonPath}.assetLogicalIds[${index}]`)),
        resources,
      };
    });
    return {
      logicalId: chapterId,
      title: string(chapter.title, `${path}.title`, 500),
      order: integer(chapter.order, `${path}.order`),
      defaultExpanded: bool(chapter.defaultExpanded, `${path}.defaultExpanded`),
      lessons,
    };
  });

  if (!Array.isArray(root.assets)) fail("$.assets", "expected array");
  let totalAssetBytes = 0;
  const assetPaths = new Set<string>();
  const assets = root.assets.map((assetValue, assetIndex) => {
    const path = `$.assets[${assetIndex}]`;
    const asset = record(assetValue, path, ["logicalId", "path", "sha256", "byteLength", "mimeType", "visibility"]);
    const id = logicalId(asset.logicalId, `${path}.logicalId`);
    unique(id, seen, `${path}.logicalId`);
    const byteLength = integer(asset.byteLength, `${path}.byteLength`, 1);
    if (byteLength > budgets.maxAssetBytes) fail(`${path}.byteLength`, "asset size budget exceeded");
    totalAssetBytes += byteLength;
    if (!Number.isSafeInteger(totalAssetBytes) || totalAssetBytes > budgets.maxTotalAssetBytes) fail("$.assets", "total asset size budget exceeded");
    const sha256 = string(asset.sha256, `${path}.sha256`, 64);
    if (!/^[a-f0-9]{64}$/.test(sha256)) fail(`${path}.sha256`, "expected lowercase SHA-256");
    const assetPath = safeAssetPath(asset.path, `${path}.path`);
    if (assetPaths.has(assetPath)) fail(`${path}.path`, `duplicate asset path ${assetPath}`);
    assetPaths.add(assetPath);
    return {
      logicalId: id,
      path: assetPath,
      sha256,
      byteLength,
      mimeType: string(asset.mimeType, `${path}.mimeType`, 200),
      visibility: oneOf(asset.visibility, `${path}.visibility`, ["public", "private"] as const),
    };
  });

  entityCount += assets.length;
  if (entityCount > budgets.maxEntities) fail("$", "entity count budget exceeded");
  const assetIds = new Set(assets.map((asset) => asset.logicalId));
  const imageAssetLogicalId = courseRaw.imageAssetLogicalId === undefined ? undefined : logicalId(courseRaw.imageAssetLogicalId, "$.course.imageAssetLogicalId");
  const refs = [imageAssetLogicalId, ...chapters.flatMap((chapter) => chapter.lessons.flatMap((lesson) => [
    ...lesson.assetLogicalIds,
    ...lesson.resources.map((resource) => resource.assetLogicalId),
  ]))].filter((id): id is string => Boolean(id));
  for (const id of refs) if (!assetIds.has(id)) fail("$", `unknown asset reference ${id}`);

  return {
    schema: COURSE_EXPORT_SCHEMA,
    exportedAt,
    sourceIdentity: "database-id",
    course: {
      logicalId: courseId,
      title: string(courseRaw.title, "$.course.title", 500),
      description: nullableString(courseRaw.description, "$.course.description"),
      order: integer(courseRaw.order, "$.course.order"),
      publicationIntent: oneOf(courseRaw.publicationIntent, "$.course.publicationIntent", ["draft", "published", "archived"] as const),
      ...(imageAssetLogicalId ? { imageAssetLogicalId } : {}),
      chapters,
    },
    assets,
  };
}
