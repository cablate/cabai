import Link from "next/link";
import { and, countDistinct, eq, isNull, max } from "drizzle-orm";
import { MagnifyingGlass, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { db } from "@/lib/db";
import { chapters, courses, lessons, planCourses } from "@/lib/db/schema";
import { getAllLocalPlans } from "@/lib/plans-local";
import { validateCourseReadiness } from "@/lib/course-validation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateCourseForm } from "./create-course-form";
import {
  filterAndSortCourseRows,
  parseCourseListFilters,
  type CourseListRow,
} from "./course-list-view-model";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "success" | "warning" }> = {
  draft: { label: "草稿", variant: "default" },
  published: { label: "已發布", variant: "success" },
  archived: { label: "已封存", variant: "warning" },
};

interface AdminCoursesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function latestDate(...values: Array<Date | string | null | undefined>) {
  return new Date(Math.max(...values.filter(Boolean).map((value) => new Date(value!).getTime())));
}

function formatUpdatedAt(value: Date) {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).format(value);
}

export default async function AdminCoursesPage({ searchParams }: AdminCoursesPageProps) {
  const filters = parseCourseListFilters(await searchParams);
  const [allCourses, allPlans, allMappings] = await Promise.all([
    db
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        status: courses.status,
        sortOrder: courses.sortOrder,
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
        chapterCount: countDistinct(chapters.id),
        lessonCount: countDistinct(lessons.id),
        chapterUpdatedAt: max(chapters.updatedAt),
        lessonUpdatedAt: max(lessons.updatedAt),
      })
      .from(courses)
      .leftJoin(
        chapters,
        and(eq(courses.id, chapters.courseId), isNull(chapters.deletedAt)),
      )
      .leftJoin(
        lessons,
        and(eq(courses.id, lessons.courseId), isNull(lessons.deletedAt)),
      )
      .where(isNull(courses.deletedAt))
      .groupBy(courses.id)
      .orderBy(courses.sortOrder),
    getAllLocalPlans(),
    db
      .select({ courseId: planCourses.courseId, planId: planCourses.planId })
      .from(planCourses)
      .where(isNull(planCourses.removedAt)),
  ]);

  const coursePlanMap = new Map<string, string[]>();
  for (const mapping of allMappings) {
    const planIds = coursePlanMap.get(mapping.courseId) ?? [];
    planIds.push(mapping.planId);
    coursePlanMap.set(mapping.courseId, planIds);
  }

  const readinessResults = await Promise.all(
    allCourses.map((course) => validateCourseReadiness(course.id)),
  );

  const rows: CourseListRow[] = allCourses.map((course, index) => {
    const planIds = coursePlanMap.get(course.id) ?? [];
    const readiness = readinessResults[index]!;
    const planName = planIds
      .map((planId) => allPlans.find((plan) => plan.id === planId)?.name ?? planId)
      .join("、");

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status,
      chapterCount: course.chapterCount,
      lessonCount: course.lessonCount,
      planName: planName || "未上架",
      planCount: planIds.length,
      lastUpdatedAt: latestDate(
        course.updatedAt,
        course.chapterUpdatedAt,
        course.lessonUpdatedAt,
        course.createdAt,
      ),
      readiness: {
        ready: readiness.ready,
        score: readiness.score,
        issueCount: readiness.issues.length,
        blockingIssueCount: readiness.issues.filter((issue) => issue.severity === "error").length,
      },
    };
  });

  const visibleRows = filterAndSortCourseRows(rows, filters);
  const hasFilters = Boolean(
    filters.q ||
    filters.status !== "all" ||
    filters.readiness !== "all" ||
    filters.sort !== "updated_desc",
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="課程管理"
        description="先找出需要處理的課程，再進入課綱與內容。完整度沿用正式發布檢查，不另造一套判準。"
      />

      <details className="group rounded-2xl border border-border-subtle bg-surface">
        <summary
          aria-label="展開建立課程表單"
          className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium text-text-primary sm:px-6"
        >
          建立課程
          <span className="text-sm text-text-muted group-open:hidden">展開表單</span>
        </summary>
        <div className="border-t border-border-subtle p-5 sm:p-6">
          <CreateCourseForm plans={allPlans.map((plan) => ({ id: plan.id, name: plan.name }))} />
        </div>
      </details>

      <section className="space-y-4" aria-labelledby="course-workspace-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="course-workspace-title" className="text-lg font-semibold text-text-primary">課程工作區</h2>
            <p className="mt-1 text-sm text-text-secondary">
              顯示 {visibleRows.length}／{rows.length} 門課程
            </p>
          </div>
        </div>

        <form method="get" className="grid gap-3 rounded-2xl border border-border-subtle bg-surface p-4 lg:grid-cols-[minmax(15rem,1fr)_auto_auto_auto_auto] lg:items-end">
          <label className="grid gap-1.5 text-xs font-medium text-text-secondary">
            搜尋課程或方案
            <span className="relative">
              <MagnifyingGlass size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
              <input
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder="輸入課程名稱、說明或方案"
                className="min-h-10 w-full rounded-lg border border-border-subtle bg-surface pl-10 pr-3 text-sm text-text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-text-secondary">
            課程狀態
            <select name="status" defaultValue={filters.status} className="min-h-10 rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary">
              <option value="all">全部狀態</option>
              <option value="draft">草稿</option>
              <option value="published">已發布</option>
              <option value="archived">已封存</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-text-secondary">
            發布完整度
            <select name="readiness" defaultValue={filters.readiness} className="min-h-10 rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary">
              <option value="all">全部完整度</option>
              <option value="ready">可發布</option>
              <option value="needs_attention">需要處理</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-text-secondary">
            排序
            <select name="sort" defaultValue={filters.sort} className="min-h-10 rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary">
              <option value="updated_desc">最近更新優先</option>
              <option value="updated_asc">最久未更新優先</option>
              <option value="title_asc">課程名稱</option>
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="min-h-10 flex-1 lg:flex-none">套用</Button>
            {hasFilters && (
              <Link prefetch={false} href="/admin/courses" className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-medium text-text-secondary hover:bg-surface-muted">
                清除
              </Link>
            )}
          </div>
        </form>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-surface px-6 py-12 text-center text-sm text-text-muted">
            尚未建立任何課程。請先建立課程，再到商品交付設定連接方案。
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-surface px-6 py-12 text-center">
            <p className="text-sm font-medium text-text-primary">沒有符合目前條件的課程</p>
            <Link prefetch={false} href="/admin/courses" className="mt-3 inline-flex text-sm font-medium text-accent hover:text-success">清除搜尋與篩選</Link>
          </div>
        ) : (
          <>
            <div className="grid gap-3 lg:hidden">
              {visibleRows.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-2xl border border-border-subtle bg-surface lg:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-muted/60">
                    <th className="px-5 py-3.5 text-xs font-medium text-text-muted">課程</th>
                    <th className="px-5 py-3.5 text-xs font-medium text-text-muted">狀態與完整度</th>
                    <th className="px-5 py-3.5 text-xs font-medium text-text-muted">方案</th>
                    <th className="px-5 py-3.5 text-xs font-medium text-text-muted">內容</th>
                    <th className="px-5 py-3.5 text-xs font-medium text-text-muted">最後更新</th>
                    <th className="px-5 py-3.5 text-right text-xs font-medium text-text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {visibleRows.map((course) => {
                    const badge = STATUS_BADGE[course.status] ?? { label: course.status, variant: "default" as const };
                    return (
                      <tr key={course.id} className="transition-colors hover:bg-surface-muted/60">
                        <td className="max-w-sm px-5 py-4">
                          <p className="font-medium text-text-primary">{course.title}</p>
                          {course.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{course.description}</p>}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                            <ReadinessBadge course={course} />
                          </div>
                        </td>
                        <td className="max-w-56 px-5 py-4 text-text-secondary">{course.planName}</td>
                        <td className="px-5 py-4 font-mono text-xs text-text-secondary">{course.chapterCount} 章 · {course.lessonCount} 堂</td>
                        <td className="whitespace-nowrap px-5 py-4 text-xs text-text-secondary">{formatUpdatedAt(course.lastUpdatedAt)}</td>
                        <td className="px-5 py-4 text-right">
                          <Link prefetch={false} href={`/admin/courses/${course.id}`} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-accent hover:bg-accent/10 hover:text-success">
                            開啟工作區
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ReadinessBadge({ course }: { course: CourseListRow }) {
  if (course.readiness.ready) {
    return <Badge variant="success">可發布 · {course.readiness.score} 分</Badge>;
  }
  return (
    <Badge variant="danger">
      <WarningCircle size={13} weight="fill" aria-hidden="true" />
      {course.readiness.blockingIssueCount} 個必要項目
    </Badge>
  );
}

function CourseCard({ course }: { course: CourseListRow }) {
  const badge = STATUS_BADGE[course.status] ?? { label: course.status, variant: "default" as const };
  return (
    <article className="rounded-2xl border border-border-subtle bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary">{course.title}</h3>
          {course.description && <p className="mt-1 line-clamp-2 text-sm leading-6 text-text-secondary">{course.description}</p>}
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <ReadinessBadge course={course} />
        <Badge>{course.chapterCount} 章 · {course.lessonCount} 堂</Badge>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">關聯方案</dt>
          <dd className="text-right text-text-secondary">{course.planName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">最後更新</dt>
          <dd className="text-right text-text-secondary">{formatUpdatedAt(course.lastUpdatedAt)}</dd>
        </div>
      </dl>
      <Link prefetch={false} href={`/admin/courses/${course.id}`} className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90 active:scale-[0.99]">
        開啟工作區
      </Link>
    </article>
  );
}
