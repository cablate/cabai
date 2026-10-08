export type CourseListStatus = "all" | "draft" | "published" | "archived";
export type CourseListReadiness = "all" | "ready" | "needs_attention";
export type CourseListSort = "updated_desc" | "updated_asc" | "title_asc";

export interface CourseListFilters {
  q: string;
  status: CourseListStatus;
  readiness: CourseListReadiness;
  sort: CourseListSort;
}

export interface CourseListRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  chapterCount: number;
  lessonCount: number;
  planName: string;
  planCount: number;
  lastUpdatedAt: Date;
  readiness: {
    ready: boolean;
    score: number;
    issueCount: number;
    blockingIssueCount: number;
  };
}

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCourseListFilters(
  params: Record<string, SearchValue>,
): CourseListFilters {
  const status = first(params.status);
  const readiness = first(params.readiness);
  const sort = first(params.sort);

  return {
    q: first(params.q)?.trim() ?? "",
    status: status === "draft" || status === "published" || status === "archived"
      ? status
      : "all",
    readiness: readiness === "ready" || readiness === "needs_attention"
      ? readiness
      : "all",
    sort: sort === "updated_asc" || sort === "title_asc"
      ? sort
      : "updated_desc",
  };
}

export function filterAndSortCourseRows(
  rows: CourseListRow[],
  filters: CourseListFilters,
): CourseListRow[] {
  const query = filters.q.toLocaleLowerCase("zh-TW");

  return rows
    .filter((row) => {
      if (filters.status !== "all" && row.status !== filters.status) return false;
      if (filters.readiness === "ready" && !row.readiness.ready) return false;
      if (filters.readiness === "needs_attention" && row.readiness.ready) return false;
      if (!query) return true;

      return [row.title, row.description ?? "", row.planName]
        .some((value) => value.toLocaleLowerCase("zh-TW").includes(query));
    })
    .sort((left, right) => {
      if (filters.sort === "title_asc") {
        return left.title.localeCompare(right.title, "zh-Hant");
      }
      const direction = filters.sort === "updated_asc" ? 1 : -1;
      return (left.lastUpdatedAt.getTime() - right.lastUpdatedAt.getTime()) * direction;
    });
}
