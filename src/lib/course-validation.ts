import { db } from "@/lib/db";
import { courses, planCourses, chapters, lessons, planPresentations, plans } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export interface ValidationIssue {
  severity: "error" | "warning";
  field: string;
  message: string;
  entityType: string;
  entityId: string;
}

export interface ValidationResult {
  ready: boolean;
  score: number;
  issues: ValidationIssue[];
}

/**
 * Validate whether a course is ready to publish.
 * Returns a readiness score (0-100) and a list of issues.
 */
export async function validateCourseReadiness(
  courseId: string,
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  // Load course
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
  });

  if (!course) {
    return { ready: false, score: 0, issues: [{ severity: "error", field: "course", message: "課程不存在", entityType: "course", entityId: courseId }] };
  }

  // Check course is linked to at least one active plan
  const linkedPlans = await db
    .select({ planId: planCourses.planId })
    .from(planCourses)
    .innerJoin(plans, eq(planCourses.planId, plans.id))
    .where(and(eq(planCourses.courseId, courseId), isNull(planCourses.removedAt)));

  if (linkedPlans.length === 0) {
    issues.push({ severity: "error", field: "plan", message: "課程未上架到任何方案", entityType: "course", entityId: courseId });
  }

  // Check at least one linked plan has a presentation
  let hasAnyPresentation = false;
  for (const lp of linkedPlans) {
    const presentation = await db.query.planPresentations.findFirst({
      where: and(
        eq(planPresentations.planId, lp.planId),
        isNull(planPresentations.deletedAt),
      ),
    });

    if (presentation) {
      hasAnyPresentation = true;
      if (!presentation.coverImage) {
        issues.push({ severity: "warning", field: "presentation.coverImage", message: `方案 Presentation 缺少封面圖`, entityType: "planPresentation", entityId: presentation.id });
      }
      if (!presentation.description) {
        issues.push({ severity: "warning", field: "presentation.description", message: `方案 Presentation 缺少說明`, entityType: "planPresentation", entityId: presentation.id });
      }
    }
  }

  if (!hasAnyPresentation && linkedPlans.length > 0) {
    issues.push({ severity: "error", field: "presentation", message: "所有關聯方案都尚未建立 Presentation", entityType: "course", entityId: courseId });
  }

  // Check course has description
  if (!course.description) {
    issues.push({ severity: "warning", field: "course.description", message: "課程缺少說明", entityType: "course", entityId: courseId });
  }

  // Check course has image
  if (!course.image) {
    issues.push({ severity: "warning", field: "course.image", message: "課程缺少封面圖", entityType: "course", entityId: courseId });
  }

  // Check chapters
  const allChapters = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.courseId, courseId), isNull(chapters.deletedAt)));

  if (allChapters.length === 0) {
    issues.push({ severity: "error", field: "chapters", message: "至少需要 1 個章節", entityType: "course", entityId: courseId });
  }

  // Check lessons per chapter
  const allLessons = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.courseId, courseId), isNull(lessons.deletedAt)));

  let hasPreview = false;

  for (const ch of allChapters) {
    const chapterLessons = allLessons.filter((l) => l.chapterId === ch.id);
    if (chapterLessons.length === 0) {
      issues.push({ severity: "error", field: "chapter.lessons", message: `章節「${ch.title}」沒有任何課堂`, entityType: "chapter", entityId: ch.id });
    }

    for (const l of chapterLessons) {
      if (!l.content || l.content.trim() === "") {
        issues.push({ severity: "error", field: "lesson.content", message: `課堂「${l.title}」缺少內容`, entityType: "lesson", entityId: l.id });
      }
      if (l.isPreview) hasPreview = true;
    }
  }

  if (!hasPreview && allLessons.length > 0) {
    issues.push({ severity: "warning", field: "lessons.preview", message: "建議至少設定 1 堂免費試看", entityType: "course", entityId: courseId });
  }

  // Calculate score
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const totalChecks = 8 + allChapters.length + allLessons.length; // approximate
  const failedChecks = errorCount + warningCount * 0.3;
  const score = Math.max(0, Math.round(((totalChecks - failedChecks) / totalChecks) * 100));

  return {
    ready: errorCount === 0,
    score,
    issues,
  };
}
