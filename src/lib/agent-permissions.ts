/**
 * Client-safe agent permission types + constants.
 *
 * Separated from `agent-auth.ts` because the latter pulls in db / pg
 * which can't be bundled into a client component (e.g. the admin
 * API key manager UI needs the option list).
 *
 * Server code can keep importing from `@/lib/agent-auth` — that module
 * re-exports everything here.
 */

export type LegacyAgentPermission = "read" | "write" | "delete" | "publish";
export type AgentPermission =
  | LegacyAgentPermission
  | "content:read"
  | "content:write"
  | "content:delete"
  | "content:publish"
  | "members:read"
  | "orders:read"
  | "media:write"
  | "entitlements:write"
  | "system:read"
  | "system:sync"
  | "webhooks:read"
  | "webhooks:retry"
  | "plan:write"
  | "plan:delete"
  | "delivery:write"
  | "service:write"
  | "media:delete"
  | "library:read"
  | "library:write"
  | "library:publish"
  | "skill:read"
  | "skill:write"
  | "skill:publish"
  | "information:read"
  | "information:write"
  | "information:publish";

export const AGENT_PERMISSION_OPTIONS: Array<{
  value: AgentPermission;
  label: string;
  description: string;
}> = [
  { value: "content:read", label: "Content read", description: "Read plans, courses, chapters, lessons, and readiness data." },
  { value: "content:write", label: "Content write", description: "Create and update courses, chapters, and lessons." },
  { value: "content:delete", label: "Content delete", description: "Soft-delete courses, chapters, and lessons." },
  { value: "content:publish", label: "Content publish", description: "Publish course bundles and run readiness checks." },
  { value: "media:write", label: "Media upload", description: "Create signed upload URLs for admin-managed media." },
  { value: "members:read", label: "Members read", description: "Read member lists and purchase access metadata." },
  { value: "orders:read", label: "Orders read", description: "Read order and revenue records." },
  { value: "entitlements:write", label: "Entitlements write", description: "Manually grant or revoke a user's access to a plan (no Portaly payment)." },
  { value: "system:read", label: "System read", description: "Read bounded operational health and prioritized administration work." },
  { value: "system:sync", label: "System sync", description: "Trigger plan sync / subscription reconciliation / order rebuild against Portaly. Destructive." },
  { value: "webhooks:read", label: "Webhooks read", description: "Read entitlement webhook delivery logs and dead-letter queue." },
  { value: "webhooks:retry", label: "Webhooks retry", description: "Re-queue dead-lettered entitlement webhooks for delivery. Destructive (external side effect)." },
  { value: "plan:write", label: "Plan write", description: "Edit local-only plan fields (featured, status, metadata). Cannot change Portaly-authoritative fields." },
  { value: "plan:delete", label: "Plan delete", description: "Soft-delete a plan (or archive if it has orders). Destructive." },
  { value: "delivery:write", label: "Delivery write", description: "Bind/unbind courses to plans and manage plan contents." },
  { value: "service:write", label: "Service write", description: "Create, update, and delete service configs (webhook integrations) for plans." },
  { value: "media:delete", label: "Media delete", description: "Hard-delete media files from R2 and DB, or batch-cleanup orphaned uploads. Destructive." },
  { value: "library:read", label: "Library read", description: "Read Library drafts, details, and readiness." },
  { value: "library:write", label: "Library write", description: "Create drafts and update draft or published Library content." },
  { value: "library:publish", label: "Library publish", description: "Publish or withdraw governed Library and Information bundles." },
  { value: "skill:read", label: "Skill read", description: "Read Skill and Skill release drafts, details, and readiness." },
  { value: "skill:write", label: "Skill write", description: "Create and update Skill and Skill release drafts." },
  { value: "skill:publish", label: "Skill publish", description: "Publish, deprecate, or withdraw governed Skill releases and Information bundles." },
  { value: "information:read", label: "Information read", description: "Read Information drafts, history, statistics, readiness, and coverage." },
  { value: "information:write", label: "Information write", description: "Prepare source bundles and create or update Information drafts." },
  { value: "information:publish", label: "Information publish", description: "Publish or withdraw standalone Information items." },
];

export const DEFAULT_AGENT_PERMISSIONS: AgentPermission[] = ["content:read"];

const LEGACY_PERMISSION_MAP: Record<LegacyAgentPermission, AgentPermission[]> = {
  read: ["content:read"],
  write: ["content:write", "media:write"],
  delete: ["content:delete"],
  publish: ["content:publish"],
};

export function normalizeAgentPermissions(
  permissions: string[] | null | undefined,
): AgentPermission[] {
  const normalized = new Set<AgentPermission>();

  for (const permission of permissions ?? DEFAULT_AGENT_PERMISSIONS) {
    if (
      permission === "read" ||
      permission === "write" ||
      permission === "delete" ||
      permission === "publish"
    ) {
      normalized.add(permission);
      for (const mapped of LEGACY_PERMISSION_MAP[permission]) {
        normalized.add(mapped);
      }
      continue;
    }

    if (AGENT_PERMISSION_OPTIONS.some((option) => option.value === permission)) {
      normalized.add(permission as AgentPermission);
    }
  }

  return normalized.size > 0 ? [...normalized] : [...DEFAULT_AGENT_PERMISSIONS];
}

export function hasAgentPermission(
  permissions: string[] | null | undefined,
  required: AgentPermission,
): boolean {
  return normalizeAgentPermissions(permissions).includes(required);
}
