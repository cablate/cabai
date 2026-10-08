import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-route";
import { db } from "@/lib/db";
import { plans, providerSyncChangeSets, providerSyncJobs } from "@/lib/db/schema";
import type { PortalyPlan } from "@/lib/portaly-types";
import { getPlans } from "@/lib/portaly";
import { expirePublicSiteCache } from "@/lib/public-site-cache-invalidation";
import {
  enqueueProviderSyncJob,
  finalizeProviderSyncJobInTransaction,
  toProviderSyncJobResponse,
  type ProviderSyncJob,
} from "@/lib/provider-sync-ledger";
import type {
  providerSyncCountsSchema,
  providerSyncPreviewResponseSchema,
} from "@/lib/agent/provider-sync-contracts";
import { fingerprintProviderSyncSource } from "@/lib/provider-sync-utils";

const CHANGE_SET_TTL_MS = 15 * 60 * 1000;
const operation = "plans" as const;

type ManagedPlan = {
  providerPlanId: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  billingPeriod: PortalyPlan["billingPeriod"];
  pricingType: NonNullable<PortalyPlan["pricingType"]> | null;
  status: PortalyPlan["status"];
  image: string | null;
  merchantPlanId: string | null;
  portalyCreatedAt: string;
  portalyUpdatedAt: string;
};

type StoredChange = {
  planId: string;
  action: "create" | "update" | "unchanged";
  before: Record<string, string | number | null> | null;
  after: Record<string, string | number | null>;
};
type ExistingPlan = Pick<typeof plans.$inferSelect,
  | "id"
  | "providerPlanId"
  | "name"
  | "description"
  | "amount"
  | "currency"
  | "billingPeriod"
  | "pricingType"
  | "status"
  | "image"
  | "merchantPlanId"
  | "portalyCreatedAt"
  | "portalyUpdatedAt"
>;

type SyncJob = ProviderSyncJob;
type Counts = typeof providerSyncCountsSchema._output;

function managedPlan(plan: PortalyPlan): ManagedPlan {
  return {
    providerPlanId: plan.id,
    name: plan.name,
    description: plan.description ?? null,
    amount: plan.amount,
    currency: plan.currency,
    billingPeriod: plan.billingPeriod,
    pricingType: plan.pricingType ?? null,
    status: plan.status,
    image: plan.image ?? null,
    merchantPlanId: plan.merchantPlanId ?? null,
    portalyCreatedAt: plan.createdAt,
    portalyUpdatedAt: plan.updatedAt,
  };
}

function localManagedPlan(row: ExistingPlan): ManagedPlan {
  return {
    providerPlanId: row.providerPlanId ?? row.id,
    name: row.name,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    billingPeriod: row.billingPeriod,
    pricingType: row.pricingType,
    status: row.status,
    image: row.image,
    merchantPlanId: row.merchantPlanId,
    portalyCreatedAt: row.portalyCreatedAt ?? "",
    portalyUpdatedAt: row.portalyUpdatedAt ?? "",
  };
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateProviderPlans(data: PortalyPlan[]): void {
  const ids = new Set<string>();
  for (const plan of data) {
    if (!plan.id || ids.has(plan.id)) {
      throw new ApiError({ code: "INVALID_PROVIDER_RESPONSE", message: "Portaly returned duplicate or invalid plan IDs", status: 502 });
    }
    ids.add(plan.id);
  }
}

export function buildPlanSyncPreview(
  portalyPlans: PortalyPlan[],
  existingRows: ExistingPlan[],
) {
  const localById = new Map(existingRows.map((row) => [row.id, row]));
  const orderedPlans = [...portalyPlans].sort((a, b) => a.id.localeCompare(b.id));
  const localState = [...existingRows]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => ({ id: row.id, managed: localManagedPlan(row) }));
  const sourceFingerprint = fingerprint({
    provider: orderedPlans.map((plan) => ({ id: plan.id, managed: managedPlan(plan) })),
    local: localState,
  });

  const counts: Counts = { create: 0, update: 0, unchanged: 0 };
  const changes: StoredChange[] = orderedPlans.map((plan) => {
    const after = managedPlan(plan);
    const existing = localById.get(plan.id);
    const before = existing ? localManagedPlan(existing) : null;
    const action: StoredChange["action"] = before === null
      ? "create"
      : JSON.stringify(before) === JSON.stringify(after) ? "unchanged" : "update";
    counts[action] = (counts[action] ?? 0) + 1;
    return { planId: plan.id, action, before, after };
  });

  const changeSetBody = { operation, sourceFingerprint, counts, changes };
  return {
    sourceFingerprint,
    fingerprint: fingerprint(changeSetBody),
    counts,
    changes,
  };
}

export function matchesPlanSyncChangeSet(
  expected: { sourceFingerprint: string; fingerprint: string },
  actual: { sourceFingerprint: string; fingerprint: string },
): boolean {
  return expected.sourceFingerprint === actual.sourceFingerprint
    && expected.fingerprint === actual.fingerprint;
}

export function matchesProviderSyncRequest(
  previous: Pick<SyncJob, "changeSetId" | "requestFingerprint">,
  requested: { changeSetId: string; requestFingerprint: string },
): boolean {
  return previous.changeSetId === requested.changeSetId
    && previous.requestFingerprint === requested.requestFingerprint;
}

async function previewFor(portalyPlans: PortalyPlan[]) {
  const ids = portalyPlans.map((plan) => plan.id);
  const existingRows = ids.length === 0
    ? []
    : await db.select().from(plans).where(inArray(plans.id, ids));
  return buildPlanSyncPreview(portalyPlans, existingRows);
}

export async function createPlanSyncChangeSet(actorId: string) {
  const { data, error } = await getPlans();
  if (error || !data) {
    throw new ApiError({ code: "UPSTREAM_PROVIDER_ERROR", message: "Could not read plans from Portaly", status: 502 });
  }
  validateProviderPlans(data);

  const preview = await previewFor(data);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + CHANGE_SET_TTL_MS);
  const changes = preview.changes.map((change) => ({
    entityType: "plan" as const,
    entityId: change.planId,
    action: change.action,
    before: change.before,
    after: change.after,
  }));
  await db.insert(providerSyncChangeSets).values({
    id,
    operation,
    actorId,
    sourceFingerprint: preview.sourceFingerprint,
    fingerprint: preview.fingerprint,
    changes,
    counts: preview.counts,
    expiresAt,
  });

  const result = {
    changeSetId: id,
    operation,
    fingerprint: preview.fingerprint,
    counts: preview.counts,
    changes,
    externalCalls: 1,
    warnings: [],
    expiresAt: expiresAt.toISOString(),
  } satisfies typeof providerSyncPreviewResponseSchema._output;
  return result;
}

export async function executePlanSync(input: {
  actorId: string;
  agentName: string;
  idempotencyKey: string;
  changeSetId: string;
  requestFingerprint: string;
}): Promise<{ job: ReturnType<typeof toProviderSyncJobResponse>; replayed: boolean }> {
  return enqueueProviderSyncJob({ ...input, operation });
}

export async function preparePlanSyncForRunner(): Promise<{
  providerSnapshot: PortalyPlan[];
  sourceFingerprint: string;
  fingerprint: string;
}> {
  const { data, error } = await getPlans();
  if (error || !data) {
    throw new ApiError({ code: "UPSTREAM_PROVIDER_ERROR", message: "Could not refresh plans from Portaly", status: 502 });
  }
  validateProviderPlans(data);
  const preview = await previewFor(data);
  return { providerSnapshot: data, sourceFingerprint: preview.sourceFingerprint, fingerprint: preview.fingerprint };
}

export async function analyzePlanSnapshot(data: PortalyPlan[]) {
  validateProviderPlans(data);
  return previewFor(data);
}

export async function applyPlanSyncSnapshot(input: {
  jobId: string;
  leaseOwner: string;
  actorId: string;
  changeSetId: string;
  requestFingerprint: string;
  data: PortalyPlan[];
}): Promise<{ job: ReturnType<typeof toProviderSyncJobResponse>; stale: boolean }> {
  validateProviderPlans(input.data);
  const changeSet = await db.query.providerSyncChangeSets.findFirst({
      where: and(
      eq(providerSyncChangeSets.id, input.changeSetId),
      eq(providerSyncChangeSets.operation, operation),
      eq(providerSyncChangeSets.actorId, input.actorId),
    ),
  });
  if (!changeSet || changeSet.fingerprint !== input.requestFingerprint) {
    throw new ApiError({ code: "CHANGE_SET_UNAVAILABLE", message: "Provider sync change set is unavailable", status: 409 });
  }

  let stale = false;
  const synced = input.data.length;
  let terminalJob: ReturnType<typeof toProviderSyncJobResponse> | undefined;
  await db.transaction(async (tx) => {
    await tx.execute(sql`LOCK TABLE "plans" IN SHARE ROW EXCLUSIVE MODE`);
    const currentRows = input.data.length === 0
      ? []
      : await tx.select().from(plans).where(inArray(plans.id, input.data.map((plan) => plan.id)));
    const transactionFreshness = buildPlanSyncPreview(input.data, currentRows);
    if (!matchesPlanSyncChangeSet(changeSet, transactionFreshness)) {
      stale = true;
      terminalJob = await finalizeProviderSyncJobInTransaction(tx, {
        jobId: input.jobId,
        leaseOwner: input.leaseOwner,
        status: "failed",
        errorCode: "CHANGE_SET_STALE",
        result: { stale: true },
      });
      return;
    }

    const finishedAt = new Date();
    if (input.data.length > 0) {
      await tx.insert(plans).values(input.data.map((plan) => ({
        id: plan.id,
        providerPlanId: plan.id,
        name: plan.name,
        description: plan.description ?? null,
        amount: plan.amount,
        currency: plan.currency,
        billingPeriod: plan.billingPeriod,
        pricingType: plan.pricingType ?? null,
        status: plan.status,
        image: plan.image ?? null,
        merchantPlanId: plan.merchantPlanId ?? null,
        gateway: "portaly" as const,
        portalyCreatedAt: plan.createdAt,
        portalyUpdatedAt: plan.updatedAt,
        syncedAt: finishedAt,
      }))).onConflictDoUpdate({
        target: plans.id,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          amount: sql`excluded.amount`,
          currency: sql`excluded.currency`,
          billingPeriod: sql`excluded.billing_period`,
          pricingType: sql`excluded.pricing_type`,
          status: sql`excluded.status`,
          image: sql`excluded.image`,
          merchantPlanId: sql`excluded.merchant_plan_id`,
          providerPlanId: sql`excluded.provider_plan_id`,
          portalyCreatedAt: sql`excluded.portaly_created_at`,
          portalyUpdatedAt: sql`excluded.portaly_updated_at`,
          syncedAt: sql`excluded.synced_at`,
        },
      });
    }
    const planState = await tx.execute(sql`SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id)::text, '[]')) AS fingerprint FROM "plans" t`);
    const postStateFingerprint = fingerprintProviderSyncSource({
      plans: String((planState.rows[0] as { fingerprint?: string } | undefined)?.fingerprint ?? ""),
    });
    terminalJob = await finalizeProviderSyncJobInTransaction(tx, {
      jobId: input.jobId,
      leaseOwner: input.leaseOwner,
      status: "succeeded",
      synced,
      result: { synced, postStateFingerprint },
    });
  });

  if (!terminalJob) throw new Error("Provider sync plan job could not be finalized");
  if (!stale) expirePublicSiteCache("plans");
  return { job: terminalJob, stale };
}

export async function getProviderSyncJob(jobId: string, actorId: string) {
  const job = await db.query.providerSyncJobs.findFirst({
    where: and(eq(providerSyncJobs.id, jobId), eq(providerSyncJobs.actorId, actorId)),
  });
  return job ? toProviderSyncJobResponse(job) : null;
}
