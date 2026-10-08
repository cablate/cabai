import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states/empty-state";
import { ErrorState } from "@/components/ui/states/error-state";
import { getInformationCoverage } from "@/lib/services/information-service";

export default async function InformationCoveragePage() {
  const result = await getInformationCoverage();
  return <div className="space-y-8">
    <PageHeader title="Information coverage" description="Missing, stale, duplicate, stuck, withdrawn-source, and broken-action issues." actions={<Button asChild variant="secondary"><Link prefetch={false} href="/admin/information">Back</Link></Button>} />
    {!result.ok ? <Card><ErrorState title="Coverage unavailable" description={result.message} /></Card> : result.value.issues.length === 0 ? <Card><EmptyState title="No coverage issues" description="Canonical coverage checks passed." /></Card> : <Card><ul className="divide-y">{result.value.issues.map((issue, index) => <li key={`${issue.code}:${issue.sourceId}:${index}`} className="grid gap-3 p-5 md:grid-cols-[1fr_auto]"><div><p className="font-semibold text-danger">{issue.code} · owner {issue.owner}</p><p className="mt-1 text-sm">{issue.message}</p><p className="break-all font-mono text-xs text-text-muted">{issue.sourceType} / {issue.sourceId}</p></div>{issue.informationId && <Button asChild size="sm" variant="secondary"><Link prefetch={false} href={`/admin/information/${issue.informationId}`}>Inspect</Link></Button>}</li>)}</ul></Card>}
  </div>;
}
