import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { InformationDetailWorkspace } from "@/components/admin/information/information-detail-workspace";
import { ErrorState } from "@/components/ui/states/error-state";
import {
  buildInformationQualityHints,
  getInformationSourceDestinations,
  groupInformationVersions,
  resolveInformationActionPaths,
} from "@/lib/information-admin-detail";
import { buildInformationSourceBundle } from "@/lib/information-sources";
import {
  getInformation,
  getInformationHistory,
  getInformationStats,
  listInformation,
  validateInformationReadiness,
} from "@/lib/services/information-service";
import type { InformationKind } from "@/lib/services/library-skill-information-domain";

export default async function InformationDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getInformation(id);
  if (!result.ok && result.kind === "not-found") notFound();
  if (!result.ok) {
    return <ErrorState title="Information 無法載入" description={result.message} />;
  }

  const item = result.value;
  const source = await buildInformationSourceBundle(
    item.sourceType,
    item.sourceId,
    { kind: item.kind as InformationKind },
  );
  const readiness = await validateInformationReadiness(
    id,
    source.ok && source.value.requiresBundlePublish
      ? { allowBundleSource: { sourceType: item.sourceType, sourceId: item.sourceId } }
      : {},
  );

  const [stats, history, siblings, destinations] = await Promise.all([
    getInformationStats(id),
    getInformationHistory(id)
      .then((value) => ({ ok: true as const, value }))
      .catch(() => ({ ok: false as const, message: "生命週期紀錄目前無法載入。" })),
    listInformation({ sourceType: item.sourceType, sourceId: item.sourceId })
      .then((value) => value.ok
        ? { ok: true as const, value: value.value }
        : { ok: false as const, message: value.message }),
    source.ok
      ? getInformationSourceDestinations(item)
          .then((value) => value.ok
            ? { ok: true as const, value: value.value }
            : { ok: false as const, message: value.message })
      : Promise.resolve({ ok: false as const, message: source.message }),
  ]);

  const actionPaths = resolveInformationActionPaths(item.actions);
  const siblingItems = siblings.ok ? siblings.value : [];
  const versions = groupInformationVersions(item, siblingItems);
  const qualityHints = buildInformationQualityHints({
    item,
    siblings: siblingItems,
    source,
    readinessIssues: readiness.ok ? readiness.value.issues : [],
    unresolvedActions: actionPaths.unresolved,
  });

  return (
    <InformationDetailWorkspace
      item={item}
      source={source}
      readiness={readiness}
      stats={stats}
      history={history}
      siblings={siblings}
      destinations={destinations}
      actionPaths={{
        resolved: actionPaths.resolved,
        unresolvedCount: actionPaths.unresolved.length,
      }}
      qualityHints={qualityHints}
      currentPublished={versions.currentPublished}
      otherItems={versions.otherItems}
      publishIdempotencyKey={randomUUID()}
      withdrawIdempotencyKey={randomUUID()}
      now={new Date()}
    />
  );
}
