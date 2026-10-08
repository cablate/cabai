import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { courses, chapters, lessons, userProgress, users } from "@/lib/db/schema";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { checkCourseAccess } from "@/lib/course-access";
import { MarkCompleteButton } from "./mark-complete-button";
import { AutoMarkProgress } from "./auto-mark-progress";
import { ToggleAutoMark } from "./toggle-auto-mark";
import { ContentRenderer } from "@/components/content-renderer";
import {
  ChapterSidebar,
  type SidebarChapter,
} from "@/components/course/chapter-sidebar";
import { LESSON_TYPE_LABELS } from "@/lib/constants";
import { parseLessonResources } from "@/lib/lesson-content";
import { recordEvent } from "@/lib/event-tracking";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { courseId, lessonId } = await params;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { role: true, autoMarkComplete: true },
  });
  const userRole = dbUser?.role ?? "member";
  const autoMarkEnabled = dbUser?.autoMarkComplete ?? false;

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

  const lesson = await db.query.lessons.findFirst({
    where: and(
      eq(lessons.id, lessonId),
      eq(lessons.courseId, courseId),
      eq(lessons.status, "published"),
      isNull(lessons.deletedAt),
    ),
  });
  if (!lesson) notFound();

  let activePlanId = "";
  if (!lesson.isPreview) {
    const access = await checkCourseAccess(
      courseId,
      session.user.id,
      session.user.email,
      userRole,
    );
    if (!access.hasAccess) {
      redirect(`/products/${access.planId}`);
    }
    activePlanId = access.planId;
  }

  let progress = await db.query.userProgress.findFirst({
    where: and(
      eq(userProgress.userId, session.user.id),
      eq(userProgress.lessonId, lessonId),
    ),
  });

  if (!progress) {
    await db
      .insert(userProgress)
      .values({
        userId: session.user.id,
        lessonId,
        completed: false,
        progress: 0,
      })
      .onConflictDoNothing();

    progress = await db.query.userProgress.findFirst({
      where: and(
        eq(userProgress.userId, session.user.id),
        eq(userProgress.lessonId, lessonId),
      ),
    });
  } else {
    await db
      .update(userProgress)
      .set({ lastAccessedAt: new Date() })
      .where(eq(userProgress.id, progress.id));
  }

  await recordEvent({
    userId: session.user.id,
    eventType: "lesson_started",
    properties: {
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      lessonType: lesson.type,
      courseId: course.id,
      chapterId: lesson.chapterId,
    },
    source: "server",
  }).catch(() => undefined);

  const [allChapters, allLessons] = await Promise.all([
    db
      .select()
      .from(chapters)
      .where(and(eq(chapters.courseId, courseId), isNull(chapters.deletedAt)))
      .orderBy(asc(chapters.sortOrder)),
    db
      .select()
      .from(lessons)
      .where(
        and(
          eq(lessons.courseId, courseId),
          eq(lessons.status, "published"),
          isNull(lessons.deletedAt),
        ),
      )
      .orderBy(asc(lessons.sortOrder)),
  ]);

  const chapterSortMap = new Map(
    allChapters.map((chapter) => [chapter.id, chapter.sortOrder]),
  );
  const sortedLessons = [...allLessons].sort((a, b) => {
    const chapterDelta =
      (chapterSortMap.get(a.chapterId) ?? 0) -
      (chapterSortMap.get(b.chapterId) ?? 0);
    if (chapterDelta !== 0) return chapterDelta;
    return a.sortOrder - b.sortOrder;
  });

  const lessonIds = sortedLessons.map((l) => l.id);
  const allProgress =
    lessonIds.length > 0
      ? await db
          .select({
            lessonId: userProgress.lessonId,
            completed: userProgress.completed,
          })
          .from(userProgress)
          .where(
            and(
              eq(userProgress.userId, session.user.id),
              inArray(userProgress.lessonId, lessonIds),
            ),
          )
      : [];

  const progressMap = new Map<string, boolean>();
  for (const p of allProgress) {
    progressMap.set(p.lessonId, p.completed);
  }

  const sidebarChapters: SidebarChapter[] = allChapters.map((ch) => ({
    id: ch.id,
    title: ch.title,
    lessons: sortedLessons
      .filter((l) => l.chapterId === ch.id)
      .map((l) => ({
        id: l.id,
        title: l.title,
        type: l.type,
        duration: l.duration,
        isPreview: l.isPreview,
        completed: progressMap.get(l.id) ?? false,
      })),
  }));

  const completedCount = sortedLessons.filter((l) =>
    progressMap.get(l.id),
  ).length;

  const currentIdx = sortedLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIdx > 0 ? sortedLessons[currentIdx - 1] : null;
  const nextLesson =
    currentIdx >= 0 && currentIdx < sortedLessons.length - 1
      ? sortedLessons[currentIdx + 1]
      : null;

  const typeLabel = LESSON_TYPE_LABELS[lesson.type] ?? lesson.type;
  const backHref = activePlanId ? `/my/${activePlanId}` : "/dashboard";
  const backLabel = activePlanId ? "我的內容" : "儀表板";

  return (
    <div className="flex min-h-[calc(100dvh-var(--site-header-height))] bg-surface-hover">
      <ChapterSidebar
        courseId={courseId}
        courseTitle={course.title}
        chapters={sidebarChapters}
        currentLessonId={lessonId}
        completedCount={completedCount}
        totalCount={sortedLessons.length}
        backHref={backHref}
        backLabel={backLabel}
      />

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-4xl px-4 py-8 pb-16 sm:px-6 lg:px-10 lg:py-12">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <Link prefetch={false}
              href={backHref}
              className="transition-colors hover:text-text-primary"
            >
              {backLabel}
            </Link>
            <span>/</span>
            <Link prefetch={false}
              href={`/courses/${courseId}`}
              className="transition-colors hover:text-text-primary"
            >
              {course.title}
            </Link>
          </nav>

          <div className="mt-5 flex flex-wrap items-start gap-3 border-b border-border-subtle pb-6">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-muted">
                {
                  allChapters.find(
                    (chapter) => chapter.id === lesson.chapterId,
                  )?.title
                }
                {" · "}
                第 {currentIdx + 1} 堂，共 {sortedLessons.length} 堂
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary md:text-3xl">
                {lesson.title}
              </h1>
            </div>
            <span className="mt-1 shrink-0 rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-muted">
              {typeLabel}
            </span>
          </div>

          <div className="sticky top-[var(--site-header-height)] z-20 -mx-4 border-b border-border-subtle bg-surface-hover/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
              <AutoMarkProgress
                lessonId={lessonId}
                alreadyCompleted={progress?.completed ?? false}
                autoMarkEnabled={autoMarkEnabled}
              />
              <MarkCompleteButton
                lessonId={lessonId}
                isCompleted={progress?.completed ?? false}
              />
              <details className="relative">
                <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  完成設定
                </summary>
                <div className="absolute left-0 top-full z-30 mt-2 w-max rounded-xl border border-border-subtle bg-surface p-3 shadow-card">
                  <ToggleAutoMark autoMarkEnabled={autoMarkEnabled} />
                </div>
              </details>
              </div>

              <nav aria-label="課堂導覽" className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                {prevLesson && (
                  <Link prefetch={false}
                    href={`/courses/${courseId}/lessons/${prevLesson.id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary active:scale-[0.98]"
                  >
                    &larr; 上一課
                  </Link>
                )}
                {nextLesson && (
                  <Link prefetch={false}
                    href={`/courses/${courseId}/lessons/${nextLesson.id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-text-primary px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 active:scale-[0.98]"
                  >
                    下一課 &rarr;
                  </Link>
                )}
              </nav>
            </div>
          </div>

          <div className="mt-6">
            <ContentRenderer
              type={lesson.type as "video" | "text" | "pdf" | "download"}
              content={lesson.content}
              title={lesson.title}
              resources={parseLessonResources(lesson.resourcesJson)}
              demoteTopHeading
              readingTools
            />
          </div>

          <div className="mt-10 border-t border-border-subtle pt-6">
            {!nextLesson ? (
              <div className="rounded-2xl border border-success/25 bg-success-light p-5 sm:p-6">
                <p className="text-xs font-medium text-success">最後一堂</p>
                <h2 className="mt-2 text-lg font-semibold text-text-primary">
                  {progress?.completed
                    ? "這門課已完成"
                    : "完成這堂，就完成整門課"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {progress?.completed
                    ? "你可以回到課程目錄重新查看內容，或回到我的內容繼續使用已取得的資源。"
                    : "標記完成後，課程進度會同步到會員中心。"}
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  {!progress?.completed && (
                    <MarkCompleteButton
                      lessonId={lessonId}
                      isCompleted={false}
                    />
                  )}
                  <Link prefetch={false}
                    href={`/courses/${courseId}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-subtle px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    回課程目錄
                  </Link>
                  <Link prefetch={false}
                    href={backHref}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    回{backLabel}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Link prefetch={false}
                  href={`/courses/${courseId}`}
                  className="text-sm text-text-secondary transition-colors hover:text-text-primary"
                >
                  回到課程目錄
                </Link>
                <Link prefetch={false}
                  href={`/courses/${courseId}/lessons/${nextLesson.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-text-primary px-4 py-2 text-sm font-medium text-text-inverted transition-opacity hover:opacity-90 active:scale-[0.98]"
                >
                  前往下一堂 &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
