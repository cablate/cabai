import type {
  AdminInformationListFilters,
  AdminInformationListSort,
  AdminInformationListView,
} from "@/lib/services/information-service";
import type { InformationSourceType } from "@/lib/information-sources";

export type InformationListSearchParams = Record<string, string | string[] | undefined>;

const views = new Set<AdminInformationListView>(["active", "history", "all"]);
const statuses = new Set<NonNullable<AdminInformationListFilters["status"]>>([
  "draft",
  "published",
  "withdrawn",
]);
const sourceTypes = new Set<InformationSourceType>([
  "manual_announcement",
  "library_entry",
  "skill_release",
  "course",
  "api_operation",
]);
const audiences = new Set<NonNullable<AdminInformationListFilters["audience"]>>([
  "all_users",
  "source_entitled",
]);
const sorts = new Set<AdminInformationListSort>([
  "updated_desc",
  "updated_asc",
  "published_desc",
]);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(value: string | undefined, allowed: Set<T>): T | undefined {
  return value && allowed.has(value as T) ? value as T : undefined;
}

export function parseInformationListSearchParams(
  params: InformationListSearchParams,
): AdminInformationListFilters {
  const rawPage = Number(first(params.page));
  const query = first(params.q)?.trim().slice(0, 200);

  return {
    query: query || undefined,
    view: oneOf(first(params.view), views) ?? "active",
    status: oneOf(first(params.status), statuses),
    sourceType: oneOf(first(params.sourceType), sourceTypes),
    audience: oneOf(first(params.audience), audiences),
    sort: oneOf(first(params.sort), sorts) ?? "updated_desc",
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

export function informationListHref(
  filters: AdminInformationListFilters,
  overrides: Partial<AdminInformationListFilters>,
): string {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (next.query) params.set("q", next.query);
  if (next.view && next.view !== "active") params.set("view", next.view);
  if (next.status) params.set("status", next.status);
  if (next.sourceType) params.set("sourceType", next.sourceType);
  if (next.audience) params.set("audience", next.audience);
  if (next.sort && next.sort !== "updated_desc") params.set("sort", next.sort);
  if (next.page && next.page > 1) params.set("page", String(next.page));

  const query = params.toString();
  return query ? `/admin/information?${query}` : "/admin/information";
}

export function hasInformationListFilters(filters: AdminInformationListFilters): boolean {
  return Boolean(
    filters.query
    || filters.status
    || filters.sourceType
    || filters.audience
    || (filters.sort && filters.sort !== "updated_desc"),
  );
}
