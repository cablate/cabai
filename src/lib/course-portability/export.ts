import { canonicalJson } from "./canonical";
import { COURSE_EXPORT_SCHEMA, type CourseExportInput, type CourseExportV1 } from "./types";
import { validateCourseExport } from "./validation";

function byOrderAndId<T extends { order: number; logicalId: string }>(left: T, right: T): number {
  return left.order - right.order || left.logicalId.localeCompare(right.logicalId);
}

export function buildCourseExport(
  input: CourseExportInput,
  options: { includePrivate?: boolean } = {},
): CourseExportV1 {
  const hasPrivate = input.course.publicationIntent !== "published"
    || input.course.chapters.some((chapter) => chapter.lessons.some((lesson) => lesson.publicationIntent !== "published"))
    || input.assets.some((asset) => asset.visibility === "private");
  if (hasPrivate && options.includePrivate !== true) {
    throw new Error("Private course content requires includePrivate: true.");
  }

  return validateCourseExport({
    schema: COURSE_EXPORT_SCHEMA,
    exportedAt: input.exportedAt,
    sourceIdentity: "database-id",
    course: {
      ...input.course,
      chapters: [...input.course.chapters]
        .sort(byOrderAndId)
        .map((chapter) => ({
          ...chapter,
          lessons: [...chapter.lessons]
            .sort(byOrderAndId)
            .map((lesson) => ({
              ...lesson,
              assetLogicalIds: [...lesson.assetLogicalIds].sort(),
              resources: [...lesson.resources].sort(byOrderAndId),
            })),
        })),
    },
    assets: [...input.assets].sort((left, right) => left.logicalId.localeCompare(right.logicalId)),
  });
}

export function serializeCourseExport(manifest: CourseExportV1): string {
  return canonicalJson(validateCourseExport(manifest));
}
