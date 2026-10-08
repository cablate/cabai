export type DomainActor = {
  type: "user" | "agent" | "system";
  id: string;
  name?: string;
};

export type ReadinessSeverity = "error" | "warning";

export type ReadinessIssueCode =
  | "required"
  | "invalid_format"
  | "unsafe_markdown_html"
  | "unsafe_markdown_image"
  | "unsafe_link_protocol"
  | "possible_secret"
  | "stale_source"
  | "invalid_audience"
  | "invalid_materiality"
  | "broken_action"
  | "action_tampered"
  | "duplicate_information"
  | "missing_artifact"
  | "checksum_mismatch"
  | "invalid_transition";

export interface ReadinessIssue {
  code: ReadinessIssueCode;
  field: string;
  severity: ReadinessSeverity;
  message: string;
}

export interface ReadinessResult {
  ready: boolean;
  issues: ReadinessIssue[];
}

export function readinessResult(issues: ReadinessIssue[]): ReadinessResult {
  return {
    ready: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

export type DomainErrorKind =
  | "not-found"
  | "forbidden"
  | "conflict"
  | "stale-revision"
  | "immutable"
  | "validation-failed"
  | "invalid-transition"
  | "prerequisite-unavailable";

export type DomainFailure = {
  ok: false;
  kind: DomainErrorKind;
  message: string;
  retryable?: boolean;
  issues?: ReadinessIssue[];
};

export type DomainSuccess<T> = { ok: true; value: T };
export type DomainResult<T> = DomainSuccess<T> | DomainFailure;

export const domainFailureHttpStatus: Record<DomainErrorKind, number> = {
  "not-found": 404,
  forbidden: 403,
  conflict: 409,
  "stale-revision": 409,
  immutable: 409,
  "validation-failed": 422,
  "invalid-transition": 422,
  "prerequisite-unavailable": 503,
};

export function domainFailure(
  kind: DomainErrorKind,
  message: string,
  options: Pick<DomainFailure, "retryable" | "issues"> = {},
): DomainFailure {
  return { ok: false, kind, message, ...options };
}

export function domainSuccess<T>(value: T): DomainSuccess<T> {
  return { ok: true, value };
}

export type LibraryStatus = "draft" | "published" | "withdrawn";
export type SkillStatus = "draft" | "published" | "withdrawn";
export type SkillReleaseStatus = "draft" | "published" | "deprecated" | "withdrawn";
export type InformationStatus = "draft" | "published" | "withdrawn";

const transitions = {
  library: {
    draft: ["published"],
    published: ["withdrawn"],
    withdrawn: [],
  },
  skill: {
    draft: ["published"],
    published: ["withdrawn"],
    withdrawn: [],
  },
  skillRelease: {
    draft: ["published"],
    published: ["deprecated", "withdrawn"],
    deprecated: ["withdrawn"],
    withdrawn: [],
  },
  information: {
    draft: ["published"],
    published: ["withdrawn"],
    withdrawn: [],
  },
} as const;

type TransitionMap = typeof transitions;
type StatusFor<K extends keyof TransitionMap> = keyof TransitionMap[K] & string;

export function canTransition<K extends keyof TransitionMap>(
  domain: K,
  from: StatusFor<K>,
  to: StatusFor<K>,
): boolean {
  return (transitions[domain][from] as readonly string[]).includes(to);
}

export const informationKinds = [
  "manual.announcement",
  "library.published",
  "library.updated",
  "skill.released",
  "skill.deprecated",
  "course.announced",
  "course.published",
  "api.capability-added",
] as const;

export type InformationKind = (typeof informationKinds)[number];

export const informationKindSource: Record<InformationKind, "manual_announcement" | "library_entry" | "skill_release" | "course" | "api_operation"> = {
  "manual.announcement": "manual_announcement",
  "library.published": "library_entry",
  "library.updated": "library_entry",
  "skill.released": "skill_release",
  "skill.deprecated": "skill_release",
  "course.announced": "course",
  "course.published": "course",
  "api.capability-added": "api_operation",
};

export function isMaterialInformationKind(kind: string): kind is InformationKind {
  return informationKinds.includes(kind as InformationKind);
}
