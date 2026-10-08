import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { lessons, courses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { EditLessonClient } from "./edit-lesson-client";
import { parseLessonResources } from "@/lib/lesson-content";
import { getCourseOutlineSnapshot } from "@/lib/course-outline";
import { validateCourseReadiness } from "@/lib/course-validation";
import { cn } from "@/lib/utils";

export default async function EditLessonPage({
  params,
}: {
  params: Promise<{ id: string; lessonId: string }>;
}) {
  const { id: courseId, lessonId } = await params;

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });
  if (!course) notFound();

  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
  });
  if (!lesson || lesson.courseId !== courseId) notFound();

  const [outline, readiness] = await Promise.all([
    getCourseOutlineSnapshot(courseId),
    validateCourseReadiness(courseId),
  ]);
  const allChapters = outline.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title }));
  const blockingCount = readiness.issues.filter((issue) => issue.severity === "error").length;
  const warningCount = readiness.issues.filter((issue) => issue.severity === "warning").length;

  return (
    <div className="space-y-5">
      <div className="border-b border-border-subtle pb-5">
        <Link prefetch={false}
          href={`/admin/courses/${courseId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-success"
        >
          <ArrowLeft size={16} weight="bold" />
          返回 {course.title}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">
          編輯課堂
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {course.title} &rsaquo; {lesson.title}
        </p>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[15rem_minmax(0,1fr)_15rem] xl:items-start">
        <aside className="order-2 overflow-hidden rounded-2xl border border-border-subtle bg-surface xl:order-1 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto" aria-label="課程課綱">
          <div className="border-b border-border-subtle px-4 py-3">
            <h2 className="text-sm font-semibold text-text-primary">課程課綱</h2>
            <p className="mt-1 text-xs text-text-muted">{outline.chapters.length} 章 · {outline.chapters.reduce((count, chapter) => count + chapter.lessons.length, 0)} 堂</p>
          </div>
          <div className="divide-y divide-border-subtle">
            {outline.chapters.map((chapter) => (
              <section key={chapter.id} className="py-2">
                <h3 className="px-4 py-2 text-xs font-semibold text-text-secondary">{chapter.title}</h3>
                <div>
                  {chapter.lessons.map((outlineLesson) => (
                    <a
                      key={outlineLesson.id}
                      href={`/admin/courses/${courseId}/lessons/${outlineLesson.id}/edit`}
                      aria-current={outlineLesson.id === lessonId ? "page" : undefined}
                      className={cn(
                        "block border-l-2 px-4 py-2.5 text-sm transition-colors",
                        outlineLesson.id === lessonId
                          ? "border-accent bg-accent-light font-medium text-text-primary"
                          : "border-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary",
                      )}
                    >
                      {outlineLesson.title}
                    </a>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <main className="order-1 min-w-0 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-8 xl:order-2">
          <EditLessonClient
            courseId={courseId}
            lesson={{
              id: lesson.id,
              chapterId: lesson.chapterId,
              title: lesson.title,
              type: lesson.type,
              content: lesson.content,
              duration: lesson.duration,
              isPreview: lesson.isPreview,
              sortOrder: lesson.sortOrder,
              status: lesson.status,
              version: lesson.updatedAt.toISOString(),
              resources: parseLessonResources(lesson.resourcesJson),
            }}
            chapters={allChapters}
          />
        </main>

        <aside className="order-3 space-y-4 xl:sticky xl:top-20" aria-label="發布狀態">
          <div className="rounded-2xl border border-border-subtle bg-surface p-5">
            <div className="flex items-start gap-2">
              {readiness.ready ? <CheckCircle size={19} weight="fill" className="mt-0.5 shrink-0 text-success" /> : <WarningCircle size={19} weight="fill" className="mt-0.5 shrink-0 text-danger" />}
              <div>
                <h2 className="text-sm font-semibold text-text-primary">發布準備度 {readiness.score}</h2>
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  {blockingCount > 0 ? `${blockingCount} 個必要項目待處理` : "必要項目已通過"}
                  {warningCount > 0 ? `，另有 ${warningCount} 個建議` : ""}
                </p>
              </div>
            </div>
            <a href={`/admin/courses/${courseId}`} className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-accent hover:text-success">查看完整課程狀態</a>
          </div>
          <div className="rounded-2xl border border-border-subtle bg-surface p-5">
            <h2 className="text-sm font-semibold text-text-primary">課堂設定</h2>
            <p className="mt-2 text-xs leading-5 text-text-secondary">類型、章節、發布狀態與預覽權限都在中央編輯區儲存。</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
