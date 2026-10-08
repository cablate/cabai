import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { publishCourse } from "../actions";
import Link from "next/link";
import { ArrowLeft, ArrowSquareOut, CheckCircle, Plus, WarningCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateChapterForm } from "./create-chapter-form";
import { validateCourseReadiness, type ValidationIssue } from "@/lib/course-validation";
import { getCourseOutlineSnapshot } from "@/lib/course-outline";
import { CourseOutlineEditor } from "./course-outline-editor";
import { DeleteCourseButton } from "./delete-course-button";
import { buildInformationSourceBundle } from "@/lib/information-sources";
import { listInformation, validateInformationReadiness } from "@/lib/services/information-service";
import { CourseDetailsForm } from "./course-details-form";

function getReadinessDestination(courseId: string, issue: ValidationIssue) {
  if (issue.entityType === "lesson") {
    return {
      href: `/admin/courses/${courseId}/lessons/${issue.entityId}/edit`,
      label: "前往課堂編輯",
    };
  }
  if (issue.entityType === "chapter") {
    return {
      href: `#chapter-${issue.entityId}`,
      label: "前往該章節",
    };
  }
  if (issue.field === "chapters") {
    return {
      href: "#new-chapter",
      label: "新增章節",
    };
  }
  if (issue.field === "course.description") {
    return {
      href: "#course-details",
      label: "補上課程說明",
    };
  }
  if (
    issue.field === "plan"
    || issue.field === "presentation"
    || issue.field.startsWith("presentation.")
  ) {
    return {
      href: "/admin/plans",
      label: "前往方案管理",
    };
  }
  if (issue.field === "lessons.preview") {
    return {
      href: "#outline-workspace",
      label: "查看課綱",
    };
  }
  return null;
}

export default async function AdminCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const course = await db.query.courses.findFirst({
    where: eq(courses.id, id),
  });

  if (!course) notFound();

  const [outline, readiness, sourceBundle, informationResult] = await Promise.all([
    getCourseOutlineSnapshot(id),
    validateCourseReadiness(id),
    buildInformationSourceBundle("course", id),
    listInformation({ sourceType: "course", sourceId: id }),
  ]);
  const allChapters = outline.chapters;
  const allLessons = outline.chapters.flatMap((chapter) => chapter.lessons);
  const blockingIssues = readiness.issues.filter((issue) => issue.severity === "error");
  const warningIssues = readiness.issues.filter((issue) => issue.severity === "warning");
  const matchingInformation = sourceBundle.ok && informationResult.ok
    ? informationResult.value.find((item) => item.status === "draft" && item.sourceVersion === sourceBundle.value.sourceVersion)
    : undefined;
  const informationReadiness = matchingInformation
    ? await validateInformationReadiness(matchingInformation.id, {
        allowBundleSource: { sourceType: "course", sourceId: id },
      })
    : null;
  const informationReady = Boolean(informationReadiness?.ok && informationReadiness.value.ready);
  const hasPendingMaterial = course.status !== "published" || allLessons.some((lesson) => lesson.status === "draft");
  const bundleReady = readiness.ready && informationReady && sourceBundle.ok && matchingInformation;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link prefetch={false}
            href="/admin/courses"
            className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-success"
          >
            <ArrowLeft size={16} weight="bold" />
            返回課程列表
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-text-primary">
            {course.title}
          </h1>
          {course.description && (
            <p className="mt-1 text-sm text-text-muted">{course.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={course.status === "published" ? "success" : "default"}>
            {course.status === "published" ? "已發布" : course.status === "archived" ? "已封存" : "草稿"}
          </Badge>
          <Link prefetch={false}
            href={`/courses/${id}`}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-muted"
          >
            預覽
          </Link>
          <DeleteCourseButton courseId={id} courseTitle={course.title} />
        </div>
      </div>

      <details
        id="course-details"
        className="group scroll-mt-24 rounded-2xl border border-border-subtle bg-surface"
        open={!course.description}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <span>
            <span className="block text-base font-semibold text-text-primary">課程基本資料</span>
            <span className="mt-1 block text-sm font-normal text-text-muted">管理課程名稱與說明；課堂內容仍在各 lesson 編輯頁處理。</span>
          </span>
          <span className="text-xs text-text-muted group-open:hidden">展開編輯</span>
        </summary>
        <div className="border-t border-border-subtle p-5 sm:p-6">
          <CourseDetailsForm
            courseId={id}
            title={course.title}
            description={course.description}
          />
        </div>
      </details>

      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface" aria-labelledby="publish-readiness-title">
        <div className="flex flex-col gap-5 border-b border-border-subtle p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            {readiness.ready ? (
              <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <XCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
            )}
            <div>
              <h2 id="publish-readiness-title" className="text-base font-semibold text-text-primary">
                {readiness.ready ? "必要發布檢查已通過" : `尚有 ${blockingIssues.length} 個必要項目`}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                完整度 {readiness.score} 分。警告不會阻擋發布，必要項目必須先修正。
              </p>
            </div>
          </div>

          {hasPendingMaterial && bundleReady && (
            <form action={async () => {
              "use server";
              await publishCourse({
                courseId: id,
                sourceVersion: sourceBundle.value.sourceVersion,
                informationId: matchingInformation.id,
                expectedInformationRevision: matchingInformation.revision,
                idempotencyKey: randomUUID(),
              });
            }}>
              <Button type="submit" className="w-full sm:w-auto">
                發布課程、課堂與 Information
              </Button>
            </form>
          )}
          {!hasPendingMaterial && <Badge variant="success">目前內容已發布</Badge>}
        </div>

        {readiness.issues.length > 0 ? (
          <div className="divide-y divide-border-subtle">
            {blockingIssues.length > 0 && (
              <div className="p-5 sm:p-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-danger">
                  <XCircle size={17} weight="fill" aria-hidden="true" />
                  發布前必須處理
                </h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                  {blockingIssues.map((issue) => {
                    const destination = getReadinessDestination(id, issue);
                    return (
                      <li key={`${issue.entityType}:${issue.entityId}:${issue.field}`} className="flex flex-col gap-1 rounded-lg bg-danger-light/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <span>{issue.message}</span>
                        {destination && (
                          <Link prefetch={false} href={destination.href} className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:text-success">
                            {destination.label}<ArrowSquareOut size={14} aria-hidden="true" />
                          </Link>
                        )}
                        {!destination && issue.field === "course.image" && (
                          <span className="shrink-0 text-xs text-text-muted">目前尚無安全的圖片指派入口</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {warningIssues.length > 0 && (
              <div className="p-5 sm:p-6">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-warning">
                  <WarningCircle size={17} weight="fill" aria-hidden="true" />
                  建議改善
                </h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                  {warningIssues.map((issue) => {
                    const destination = getReadinessDestination(id, issue);
                    return (
                      <li key={`${issue.entityType}:${issue.entityId}:${issue.field}`} className="flex flex-col gap-1 rounded-lg bg-warning-light/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <span>{issue.message}</span>
                        {destination && (
                          <Link prefetch={false} href={destination.href} className="inline-flex shrink-0 items-center gap-1 font-medium text-accent hover:text-success">
                            {destination.label}<ArrowSquareOut size={14} aria-hidden="true" />
                          </Link>
                        )}
                        {!destination && issue.field === "course.image" && (
                          <span className="shrink-0 text-xs text-text-muted">目前尚無安全的圖片指派入口</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="p-5 text-sm text-text-secondary sm:p-6">目前沒有需要處理的發布問題。</p>
        )}
      </section>

      {hasPendingMaterial && (
        <section className="rounded-2xl border border-border-subtle bg-surface p-5 sm:p-6" aria-labelledby="course-information-title">
          <h2 id="course-information-title" className="text-base font-semibold text-text-primary">發布 Information</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">新課程或新的草稿課堂必須和對應 Information 同一筆 transaction 發布，避免使用者先看到半套內容。</p>
          {!sourceBundle.ok && <p role="alert" className="mt-4 rounded-lg bg-danger-light p-3 text-sm text-danger">Course source 無法載入：{sourceBundle.message}</p>}
          {sourceBundle.ok && !matchingInformation && (
            <div className="mt-4 rounded-lg bg-info-light p-4 text-sm text-info">
              <p>目前版本還沒有 Information 草稿。</p>
              <div className="mt-2 flex flex-wrap gap-4">
                <Link prefetch={false} href={`/admin/information/new?sourceType=course&sourceId=${encodeURIComponent(id)}`} className="inline-flex font-semibold underline">建立目前版本的 Information</Link>
                <Link prefetch={false} href={`/admin/information/new?sourceType=course&sourceId=${encodeURIComponent(id)}&kind=course.announced`} className="inline-flex font-semibold text-accent underline">建立公開課程公告</Link>
              </div>
            </div>
          )}
          {matchingInformation && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-muted p-4 text-sm">
              <div><p className="font-semibold text-text-primary">{matchingInformation.title}</p><p className="mt-1 text-text-secondary">revision {matchingInformation.revision} · {informationReady ? "readiness passed" : "尚未通過 readiness"}</p></div>
              <Link prefetch={false} href={`/admin/information/${matchingInformation.id}`} className="font-semibold text-accent hover:text-success">檢查 Information</Link>
            </div>
          )}
        </section>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border-subtle bg-surface p-4">
          <p className="text-xs uppercase text-text-muted font-medium">章節</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{allChapters.length}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface p-4">
          <p className="text-xs uppercase text-text-muted font-medium">課堂</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{allLessons.length}</p>
        </div>
      </div>

      {/* Add chapter — inline (small form, acceptable) */}
      <div id="new-chapter" className="scroll-mt-24 rounded-2xl border border-border-subtle bg-surface p-6">
        <h2 className="mb-4 text-lg font-medium text-text-primary">新增章節</h2>
        <CreateChapterForm courseId={id} nextSortOrder={allChapters.length} />
      </div>

      <div className="space-y-4">
        {allChapters.length === 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-surface px-6 py-12 text-center text-sm text-text-muted">
            尚未新增任何章節。請先建立章節，再新增課堂內容。
          </div>
        ) : (
          <CourseOutlineEditor
            key={outline.revision}
            courseId={id}
            initialRevision={outline.revision}
            initialChapters={outline.chapters}
          />
        )}
        {allChapters.length > 0 && (
          <Link prefetch={false} href={`/admin/courses/${id}/lessons/new`} className="inline-flex">
            <Button><Plus size={16} weight="bold" />新增課堂</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
