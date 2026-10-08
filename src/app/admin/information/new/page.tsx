import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states/error-state";
import { InformationDraftForm } from "@/components/admin/information/information-form";
import { buildInformationSourceBundle, type InformationSourceType } from "@/lib/information-sources";
import { informationKinds, type InformationKind } from "@/lib/services/library-skill-information-domain";

const sourceTypes = new Set<InformationSourceType>([
  "manual_announcement",
  "library_entry",
  "skill_release",
  "course",
  "api_operation",
]);

export default async function NewInformationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const rawType = typeof query.sourceType === "string" ? query.sourceType : "";
  const sourceId = typeof query.sourceId === "string" ? query.sourceId.trim() : "";
  const requestedKind = typeof query.kind === "string" && informationKinds.includes(query.kind as InformationKind)
    ? query.kind as InformationKind
    : undefined;
  const sourceType = sourceTypes.has(rawType as InformationSourceType) ? rawType as InformationSourceType : null;
  const canLoad = sourceType === "manual_announcement" || Boolean(sourceId);
  const source = sourceType && canLoad
    ? await buildInformationSourceBundle(sourceType, sourceId, { kind: requestedKind })
    : null;

  return (
    <div className="space-y-8">
      <PageHeader title="Create Information draft" description="Create a linked resource notice or an independent public announcement." />
      <Card padding="md">
        <form method="get" className="grid gap-4 md:grid-cols-[1fr_2fr_auto]">
          <label>
            Source type
            <select name="sourceType" required defaultValue={rawType} className="mt-1 min-h-10 w-full rounded-md border px-3">
              <option value="">Choose</option>
              <option value="manual_announcement">Manual announcement</option>
              <option value="library_entry">Library</option>
              <option value="skill_release">Skill release</option>
              <option value="course">Course</option>
              <option value="api_operation">API operation</option>
            </select>
          </label>
          <label>
            Source ID
            <input name="sourceId" required={rawType !== "manual_announcement"} defaultValue={sourceId} placeholder={rawType === "manual_announcement" ? "Not required for manual announcements" : "Source ID"} className="mt-1 min-h-10 w-full rounded-md border px-3" />
          </label>
          <div className="flex items-end">
            <Button type="submit">Load source</Button>
          </div>
        </form>
      </Card>
      {source && !source.ok && <Card><ErrorState title="Source unavailable" description={source.message} /></Card>}
      {source?.ok && (
        <Card padding="md" className="space-y-5">
          <p className="rounded-lg bg-surface-muted p-3 text-sm">
            {source.value.sourceType} / {source.value.sourceId || "independent"} · {source.value.audience} · {source.value.sourceStatus}
          </p>
          {source.value.issues.length > 0 && <ul role="alert" className="list-disc bg-warning-light p-4 pl-8 text-warning">{source.value.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
          <InformationDraftForm bundle={source.value} />
        </Card>
      )}
    </div>
  );
}
