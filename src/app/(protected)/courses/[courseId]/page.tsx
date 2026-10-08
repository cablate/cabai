import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { courses, chapters, lessons, users } from "@/lib/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { checkCourseAccess } from "@/lib/course-access";
import { getLearnerCourseProgress } from "@/lib/queries/learner-course-progress";
import {
  ArrowRight,
  Books,
  Clock,
} from "@phosphor-icons/react/dist/ssr";
import { LearningProgress } from "@/components/learning/learning-progress";
import { LearnerCourseOutline } from "@/components/course/learner-course-outline";
import {
  formatLearningDuration,
  getDefaultOpenChapterId,
  getKnownRemainingDuration,
  type LearnerOutlineChapter,
} from "@/lib/learner-course-view-model";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { courseId } = await params;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { role: true },
  });
  const userRole = dbUser?.role ?? "member";

  const courseWhere =
    userRole === "admin"
      ? and(eq(courses.id, courseId), isNull(courses.deletedAt))
      : and(
          eq(courses.id, courseId),
          eq(courses.status, "published"),
          isNull(courses.deletedAt),
        );

  const course = await db.query.courses.findFirst({
    where: courseWhere,
  });

  if (!course) notFound();

  const access = await checkCourseAccess(
    course.id,
    session.user.id,
    session.user.email,
    userRole,
  );
  if (!access.hasAccess) {
    redirect(`/products/${access.planId}`);
  }
  const activePlanId = access.planId;

  const allChapters = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.courseId, courseId), isNull(chapters.deletedAt)))
    .orderBy(asc(chapters.sortOrder));

  const lessonRows = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.courseId, courseId),
        eq(lessons.status, "published"),
        isNull(lessons.deletedAt),
      ),
    )
    .orderBy(asc(lessons.sortOrder));

  // Keep the outline query local to this page; the owner supplies only the
  // learner-specific progress/read-model state.  Lessons whose chapter was
  // soft-deleted are not part of the published outline or progress total.
  const activeChapterIds = new Set(allChapters.map((chapter) => chapter.id));
  const allLessons = lessonRows.filter((lesson) =>
    activeChapterIds.has(lesson.chapterId),
  );

  const courseProgress = (
    await getLearnerCourseProgress([courseId], session.user.id)
  ).get(courseId);
  if (!courseProgress) notFound();

  const progressMap = new Map(
    Object.entries(courseProgress.lessonProgress),
  );

  const lessonsByChapter = new Map<string, typeof allLessons>();
  for (const lesson of allLessons) {
    const list = lessonsByChapter.get(lesson.chapterId) ?? [];
    list.push(lesson);
    lessonsByChapter.set(lesson.chapterId, list);
  }

  const completedCount = courseProgress.completedLessonCount;
  const learningState = courseProgress;
  const resumeHref = courseProgress.resumeHref;
  const outlineChapters: LearnerOutlineChapter[] = allChapters
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      lessons: (lessonsByChapter.get(chapter.id) ?? []).map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        type: lesson.type,
        duration: lesson.duration,
        isPreview: lesson.isPreview,
        completed: progressMap.get(lesson.id)?.completed ?? false,
        progress: progressMap.get(lesson.id)?.progress ?? 0,
      })),
    }))
    .filter((chapter) => chapter.lessons.length > 0);
  const remainingLessonCount = Math.max(
    0,
    allLessons.length - completedCount,
  );
  const remainingDuration = formatLearningDuration(
    getKnownRemainingDuration(outlineChapters),
  );
  const defaultOpenChapterId = getDefaultOpenChapterId(
    outlineChapters,
    learningState.resumeLessonId,
    learningState.isCompleted,
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
      <Link prefetch={false}
        href={`/my/${activePlanId}`}
        className="inline-flex min-h-11 items-center text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        &larr; 返回我的內容
      </Link>

      <div className="mt-3 grid gap-6 border-b border-border-subtle pb-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
      <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
        {course.title}
      </h1>
      {course.description && (
        <p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary">{course.description}</p>
      )}
        </div>
        {allLessons.length > 0 && (
          <Link prefetch={false} href={resumeHref} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 active:scale-[0.98]">
            {learningState.isCompleted ? "重新查看課程" : completedCount > 0 ? "繼續學習" : "開始學習"}
            <ArrowRight size={15} weight="bold" />
          </Link>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-border-subtle bg-surface p-5 shadow-card">
        <LearningProgress completed={completedCount} total={allLessons.length} />
        {allLessons.length > 0 && (
          <div className="mt-5 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
            <div className="flex items-start gap-3">
              <Books
                size={20}
                weight="duotone"
                className="mt-0.5 shrink-0 text-accent"
              />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {learningState.isCompleted
                    ? "全部課堂都已完成"
                    : `還有 ${remainingLessonCount} 堂`}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  共 {allLessons.length} 堂課
                </p>
              </div>
            </div>
            {remainingDuration && !learningState.isCompleted && (
              <div className="flex items-start gap-3">
                <Clock
                  size={20}
                  weight="duotone"
                  className="mt-0.5 shrink-0 text-accent"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {remainingDuration}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    依有標示時間的未完成課堂估算
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {allLessons.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border-subtle bg-surface p-6 text-sm text-text-secondary">
          目前沒有已發布的課程內容。
        </div>
      ) : (
        <div className="mt-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-text-primary">
              課程目錄
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              展開章節查看課堂；目前進度所在的章節會先為你開啟。
            </p>
          </div>
          <LearnerCourseOutline
            courseId={courseId}
            chapters={outlineChapters}
            resumeLessonId={learningState.resumeLessonId}
            defaultOpenChapterId={defaultOpenChapterId}
          />
        </div>
      )}
    </div>
  );
}
