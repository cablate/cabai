import { and, eq, isNull } from "drizzle-orm";
import { resolveInformationActionOperation, validateActionParameters } from "@/lib/agent/action-resolver";
import { db } from "@/lib/db";
import {
  planCourses,
  plans,
  type AgentInformationAction,
  type AgentInformationItem,
} from "@/lib/db/schema";
import type { InformationSourceBundle } from "@/lib/information-sources";
import {
  domainFailure,
  domainSuccess,
  type DomainResult,
  type ReadinessIssue,
} from "@/lib/services/library-skill-information-domain";

export interface InformationSourceDestination {
  label: string;
  href: string;
  kind: "admin" | "public";
}

export interface ResolvedInformationActionPath {
  rel: string;
  operationId: string;
  method: string;
  path: string;
  credential: AgentInformationAction["credential"];
}

export type InformationQualityHintCode =
  | "possible_mojibake"
  | "duplicate_information"
  | "stale_source"
  | "broken_action";

export interface InformationQualityHint {
  code: InformationQualityHintCode;
  title: string;
  description: string;
  fields?: string[];
  relatedInformationIds?: string[];
}

const mojibakeLatinPattern = /(?:Ã.|Â.|â€|ðŸ|ï¿½)/u;
const mojibakeCjkMarkers = /[銝嚗蝞撌雿蝭璅敺頛摰憭]/gu;

function hasPossibleMojibake(value: string): boolean {
  if (value.includes("\uFFFD") || mojibakeLatinPattern.test(value)) return true;
  return (value.match(mojibakeCjkMarkers) ?? []).length >= 3;
}

function encoded(value: string | number | boolean): string {
  return encodeURIComponent(String(value));
}

export function resolveInformationActionPath(
  action: AgentInformationAction,
): ResolvedInformationActionPath | null {
  const operation = resolveInformationActionOperation(action.operationId);
  if (
    !operation
    || operation.credential !== action.credential
    || !validateActionParameters(operation, action.parameters)
  ) return null;

  let path = operation.path;
  const query = new URLSearchParams();
  for (const parameter of operation.parameters) {
    const value = action.parameters[parameter.name];
    if (value === undefined) continue;
    if (parameter.in === "path") {
      path = path.replaceAll(`{${parameter.name}}`, encoded(value));
    } else if (parameter.in === "query") {
      query.set(parameter.name, String(value));
    }
  }
  if (/\{[^}]+\}/u.test(path)) return null;
  const suffix = query.toString();

  return {
    rel: action.rel,
    operationId: action.operationId,
    method: operation.method.toUpperCase(),
    path: suffix ? `${path}?${suffix}` : path,
    credential: action.credential,
  };
}

export function resolveInformationActionPaths(
  actions: AgentInformationAction[],
): {
  resolved: ResolvedInformationActionPath[];
  unresolved: AgentInformationAction[];
} {
  const resolved: ResolvedInformationActionPath[] = [];
  const unresolved: AgentInformationAction[] = [];
  for (const action of actions) {
    const path = resolveInformationActionPath(action);
    if (path) resolved.push(path);
    else unresolved.push(action);
  }
  return { resolved, unresolved };
}

export function buildInformationQualityHints(input: {
  item: AgentInformationItem;
  siblings: AgentInformationItem[];
  source: DomainResult<InformationSourceBundle>;
  readinessIssues: ReadinessIssue[];
  unresolvedActions: AgentInformationAction[];
}): InformationQualityHint[] {
  const hints: InformationQualityHint[] = [];
  const suspiciousFields = ([
    ["title", input.item.title],
    ["summary", input.item.summary],
    ["whyItMatters", input.item.whyItMatters],
    ["bodyMarkdown", input.item.bodyMarkdown],
  ] as const)
    .filter(([, value]) => hasPossibleMojibake(value))
    .map(([field]) => field);

  if (suspiciousFields.length > 0) {
    hints.push({
      code: "possible_mojibake",
      title: "疑似亂碼",
      description: "部分文字含常見錯誤解碼片段，請對照原稿人工確認；系統不會自動改寫。",
      fields: suspiciousFields,
    });
  }

  const duplicates = input.siblings.filter((candidate) => (
    candidate.id !== input.item.id
    && candidate.sourceVersion === input.item.sourceVersion
    && candidate.kind === input.item.kind
  ));
  if (duplicates.length > 0) {
    hints.push({
      code: "duplicate_information",
      title: "疑似重複 Information",
      description: "同一來源版本與種類另有 Information，請確認哪一筆才是目前應使用的內容。",
      relatedInformationIds: duplicates.map((candidate) => candidate.id),
    });
  }

  const staleSource = !input.source.ok
    || input.readinessIssues.some((issue) => issue.code === "stale_source");
  if (staleSource) {
    hints.push({
      code: "stale_source",
      title: "來源缺少或已變更",
      description: input.source.ok
        ? "Canonical readiness 顯示來源狀態或版本已經改變，請回來源頁確認。"
        : `目前無法解析來源：${input.source.message}`,
    });
  }

  const brokenActionIssues = input.readinessIssues.filter((issue) => (
    issue.code === "broken_action" || issue.code === "action_tampered"
  ));
  if (brokenActionIssues.length > 0 || input.unresolvedActions.length > 0) {
    hints.push({
      code: "broken_action",
      title: "Agent action 需要確認",
      description: "已保存的 action 無法對應目前 OpenAPI operation 或 canonical source bundle；請人工重建草稿，不會自動替換。",
      fields: brokenActionIssues.map((issue) => issue.field),
    });
  }

  return hints;
}

export function groupInformationVersions(
  current: AgentInformationItem,
  siblings: AgentInformationItem[],
  now = new Date(),
): {
  currentPublished: AgentInformationItem[];
  otherItems: AgentInformationItem[];
} {
  const currentPublished = siblings.filter((candidate) => (
    candidate.status === "published"
    && (!candidate.expiresAt || candidate.expiresAt > now)
  ));
  const currentPublishedIds = new Set(currentPublished.map((candidate) => candidate.id));
  const otherItems = siblings.filter((candidate) => (
    candidate.id !== current.id && !currentPublishedIds.has(candidate.id)
  ));
  return { currentPublished, otherItems };
}

export async function getInformationSourceDestinations(
  item: AgentInformationItem,
): Promise<DomainResult<InformationSourceDestination[]>> {
  try {
    if (item.sourceType === "manual_announcement" || item.sourceType === "api_operation") {
      return domainSuccess([]);
    }

    if (item.sourceType === "library_entry") {
      const entry = await db.query.libraryEntries.findFirst({
        where: (libraryEntries, { eq: equals }) => equals(libraryEntries.id, item.sourceId),
        columns: { id: true, slug: true, status: true },
      });
      if (!entry) return domainFailure("not-found", "Library 來源不存在");
      return domainSuccess([
        { label: "Library 管理頁", href: `/admin/library/${entry.id}`, kind: "admin" },
        ...(entry.status === "published"
          ? [{ label: "Library 公開頁", href: `/library/${encodeURIComponent(entry.slug)}`, kind: "public" as const }]
          : []),
      ]);
    }

    if (item.sourceType === "skill_release") {
      const release = await db.query.skillReleases.findFirst({
        where: (skillReleases, { eq: equals }) => equals(skillReleases.id, item.sourceId),
        columns: { id: true, status: true },
        with: {
          skill: {
            columns: { id: true, slug: true, status: true },
          },
        },
      });
      if (!release) return domainFailure("not-found", "Skill Release 來源不存在");
      return domainSuccess([
        {
          label: "Skill Release 管理頁",
          href: `/admin/skills/${release.skill.id}/releases/${release.id}`,
          kind: "admin",
        },
        ...(release.skill.status === "published" && release.status !== "draft"
          ? [{
              label: "Skill 公開頁",
              href: `/skills/${encodeURIComponent(release.skill.slug)}`,
              kind: "public" as const,
            }]
          : []),
      ]);
    }

    const linkedPlans = await db
      .select({ id: plans.id, slug: plans.slug, name: plans.name })
      .from(planCourses)
      .innerJoin(plans, eq(planCourses.planId, plans.id))
      .where(and(
        eq(planCourses.courseId, item.sourceId),
        isNull(planCourses.removedAt),
        eq(plans.status, "active"),
      ));
    return domainSuccess([
      { label: "課程管理頁", href: `/admin/courses/${item.sourceId}`, kind: "admin" },
      ...linkedPlans.map((plan) => ({
        label: `商品頁：${plan.name}`,
        href: `/products/${encodeURIComponent(plan.slug ?? plan.id)}`,
        kind: "public" as const,
      })),
    ]);
  } catch {
    return domainFailure("prerequisite-unavailable", "來源路徑目前無法解析", { retryable: true });
  }
}
