import type { ReadinessIssue } from "@/lib/services/library-skill-information-domain";

export function ReadinessPanel({
  title,
  ready,
  issues,
}: {
  title: string;
  ready: boolean;
  issues: ReadinessIssue[];
}) {
  const headingId = `readiness-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="rounded-xl border border-border-subtle bg-surface p-5" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-base font-semibold text-text-primary">{title}</h2>
        <span className={`text-sm font-medium ${ready ? "text-success" : "text-danger"}`}>
          {ready ? "已就緒" : "尚未就緒"}
        </span>
      </div>
      {issues.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Canonical readiness 未回報問題。</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.field}-${index}`} className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{issue.field}</span>
              <span aria-hidden="true"> · </span>
              {issue.message}
              <span className="ml-2 text-xs uppercase text-text-muted">{issue.code}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
