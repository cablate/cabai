/**
 * Test helpers for API-level component tests.
 *
 * Key principle: call the actual route handler with a real Request object,
 * get a real Response, and check DB state. Only mock external services.
 */
import crypto from "node:crypto";
import { db, dbPool } from "@/lib/db";
import {
  agentApiKeys, users, plans, orders, userPurchases, courses,
  chapters, lessons, planCourses, serviceConfigs, portalyProductMappings,
  portalyMarketplaceEvents, planPresentations,
} from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { requireTestDatabaseUrl } from "./setup";

// ─── Request builder ───

export function buildRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Request {
  const { method = "GET", headers = {}, body } = options;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request(`http://localhost:3002${url}`, init);
}

export function agentRequest(
  url: string,
  options: {
    method?: string;
    key?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Request {
  const { key = "", headers = {}, ...rest } = options;
  return buildRequest(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${key}`,
      "x-agent-id": "test-agent",
      ...headers,
    },
  });
}

// ─── Test data factory ───

const KEY_PREFIX = "cab_agent_";

export async function createTestUser(
  overrides: { email?: string; name?: string; role?: string } = {},
): Promise<{ id: string; email: string }> {
  const id = crypto.randomUUID();
  const email = overrides.email ?? `test-${id.slice(0, 8)}@example.com`;
  const name = overrides.name ?? "Test User";

  await db.insert(users).values({
    id,
    email,
    name,
    role: (overrides.role ?? "user") as "member" | "admin",
  });

  return { id, email };
}

export async function createTestAgentKey(
  userId: string,
  permissions: string[] = ["read", "write", "delete", "publish"],
  options: { expiresAt?: Date; revokedAt?: Date } = {},
): Promise<{ fullKey: string; keyId: string }> {
  const randomPart = crypto.randomBytes(24).toString("hex");
  const fullKey = `${KEY_PREFIX}${randomPart}`;
  const prefix = fullKey.slice(0, 16);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fullKey),
  );
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const [record] = await db
    .insert(agentApiKeys)
    .values({
      name: "test-key",
      keyPrefix: prefix,
      keyHash,
      permissions,
      createdBy: userId,
      expiresAt: options.expiresAt ?? null,
      revokedAt: options.revokedAt ?? null,
    })
    .returning({ id: agentApiKeys.id });

  return { fullKey, keyId: record!.id };
}

// ─── Plan / Order / Purchase factories ───

export async function createTestPlan(
  overrides: { id?: string; providerPlanId?: string | null; slug?: string | null; name?: string; amount?: number; currency?: string; billingPeriod?: string; pricingType?: string; status?: string } = {},
): Promise<{ id: string }> {
  const id = overrides.id ?? `plan-${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(plans).values({
    id,
    providerPlanId: overrides.providerPlanId ?? null,
    slug: overrides.slug ?? null,
    name: overrides.name ?? "Test Plan",
    amount: overrides.amount ?? 9900,
    currency: overrides.currency ?? "TWD",
    billingPeriod: (overrides.billingPeriod ?? "monthly") as "monthly" | "yearly" | "one-time",
    pricingType: (overrides.pricingType ?? "fixed") as "fixed" | "dynamic",
    status: (overrides.status ?? "active") as "active" | "inactive",
  });
  return { id };
}

export async function createTestOrder(
  userId: string,
  planId: string,
  overrides: {
    status?: string;
    subscriptionId?: string | null;
    subscriptionStatus?: string | null;
    paidAmount?: number | null;
    expectedAmount?: number | null;
    expectedCurrency?: string | null;
    portalySessionId?: string | null;
    cancelAtPeriodEnd?: boolean;
    cancelEffectiveAt?: Date | null;
    nextBillingAt?: Date | null;
    callbackPayload?: Record<string, unknown> | null;
    createdAt?: Date;
  } = {},
): Promise<{ id: string; merchantOrderNumber: string }> {
  const id = crypto.randomUUID();
  const merchantOrderNumber = `MON-test-${id.slice(0, 8)}`;
  await db.insert(orders).values({
    id,
    userId,
    planId,
    merchantOrderNumber,
    portalySessionId: overrides.portalySessionId ?? null,
    status: (overrides.status ?? "pending") as "pending" | "completed" | "failed" | "canceled" | "refunded" | "expired",
    subscriptionId: overrides.subscriptionId ?? null,
    subscriptionStatus: (overrides.subscriptionStatus ?? null) as string | null,
    expectedAmount: overrides.expectedAmount ?? null,
    expectedCurrency: overrides.expectedCurrency ?? null,
    paidAmount: overrides.paidAmount ?? null,
    cancelAtPeriodEnd: overrides.cancelAtPeriodEnd ?? false,
    cancelEffectiveAt: overrides.cancelEffectiveAt ?? null,
    nextBillingAt: overrides.nextBillingAt ?? null,
    callbackPayload: overrides.callbackPayload ?? null,
    createdAt: overrides.createdAt ?? new Date(),
  });
  return { id, merchantOrderNumber };
}

export async function createTestPurchase(
  userId: string,
  planId: string,
  orderId: string,
  overrides: { grantedBy?: string; expiresAt?: Date | null; revokedAt?: Date | null; grantedAt?: Date } = {},
): Promise<{ id: string }> {
  const [record] = await db.insert(userPurchases).values({
    userId,
    planId,
    orderId,
    grantedBy: (overrides.grantedBy ?? "payment") as "manual" | "payment" | "free_claim",
    expiresAt: overrides.expiresAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
    ...(overrides.grantedAt ? { grantedAt: overrides.grantedAt } : {}),
  }).returning({ id: userPurchases.id });
  return { id: record!.id };
}

export async function createTestCourse(
  overrides: { title?: string; status?: string; description?: string | null; image?: string | null } = {},
): Promise<{ id: string }> {
  const [course] = await db.insert(courses).values({
    title: overrides.title ?? "Test Course",
    status: (overrides.status ?? "draft") as "draft" | "published" | "archived",
    description: overrides.description ?? null,
    image: overrides.image ?? null,
  }).returning({ id: courses.id });
  return { id: course!.id };
}

export async function createTestChapter(
  courseId: string,
  overrides: { title?: string; sortOrder?: number } = {},
): Promise<{ id: string }> {
  const [chapter] = await db.insert(chapters).values({
    courseId,
    title: overrides.title ?? "Test Chapter",
    sortOrder: overrides.sortOrder ?? 0,
  }).returning({ id: chapters.id });
  return { id: chapter!.id };
}

export async function createTestLesson(
  courseId: string,
  chapterId: string,
  overrides: { title?: string; type?: string; content?: string; isPreview?: boolean; status?: string } = {},
): Promise<{ id: string }> {
  const [lesson] = await db.insert(lessons).values({
    courseId,
    chapterId,
    title: overrides.title ?? "Test Lesson",
    type: (overrides.type ?? "video") as "video" | "text" | "pdf" | "download",
    content: overrides.content ?? "https://example.com/video.mp4",
    isPreview: overrides.isPreview ?? false,
    status: (overrides.status ?? "draft") as "draft" | "published",
    sortOrder: 0,
  }).returning({ id: lessons.id });
  return { id: lesson!.id };
}

export async function linkCourseToPlan(
  courseId: string,
  planId: string,
  overrides: { removedAt?: Date | null } = {},
): Promise<void> {
  await db
    .insert(planCourses)
    .values({ planId, courseId, removedAt: overrides.removedAt ?? null })
    .onConflictDoNothing();
}

export async function createTestPresentation(
  planId: string,
  overrides: { title?: string; coverImage?: string | null; description?: string | null } = {},
): Promise<{ id: string }> {
  const [p] = await db.insert(planPresentations).values({
    planId,
    offeringType: "course",
    title: overrides.title ?? "Test Presentation",
    coverImage: overrides.coverImage ?? "https://example.com/cover.jpg",
    description: overrides.description ?? "Test description",
  }).onConflictDoNothing().returning({ id: planPresentations.id });
  if (!p) {
    // Already exists — fetch existing
    const existing = await db.query.planPresentations.findFirst({
      where: eq(planPresentations.planId, planId),
    });
    return { id: existing!.id };
  }
  return { id: p.id };
}

export async function createTestServiceConfig(
  planId: string,
  overrides: { webhookUrl?: string; apiKeyHash?: string; apiKeyPrefix?: string } = {},
): Promise<{ id: string }> {
  const [config] = await db.insert(serviceConfigs).values({
    planId,
    serviceName: "test-service",
    webhookUrl: overrides.webhookUrl ?? "https://example.com/webhook",
    apiKeyPrefix: overrides.apiKeyPrefix ?? "svc_live",
    apiKeyHash: overrides.apiKeyHash ?? crypto.createHash("sha256").update("test-service-key").digest("hex"),
    identityField: "email",
    isActive: true,
  }).returning({ id: serviceConfigs.id });
  return { id: config!.id };
}

export async function createTestProductMapping(
  portalyProductId: string,
  planId: string,
): Promise<void> {
  await db.insert(portalyProductMappings).values({
    portalyProductId,
    planId,
    productName: "Test Product",
  }).onConflictDoNothing();
}

export async function createTestMarketplaceEvent(
  overrides: {
    portalyOrderId?: string;
    portalyProductId?: string;
    event?: string;
    customerEmail?: string;
    amount?: number;
    status?: string;
    matchedUserId?: string | null;
    matchedPlanId?: string | null;
    createdOrderId?: string | null;
  } = {},
): Promise<{ id: string }> {
  const [record] = await db.insert(portalyMarketplaceEvents).values({
    portalyOrderId: overrides.portalyOrderId ?? `mkt-ord-${crypto.randomUUID().slice(0, 8)}`,
    portalyProductId: overrides.portalyProductId ?? "prod_test",
    event: (overrides.event ?? "paid") as "paid" | "refund",
    customerEmail: overrides.customerEmail ?? "test-buyer@example.com",
    amount: overrides.amount ?? 5000,
    currency: "TWD",
    discount: 0,
    feeAmount: 0,
    netTotal: overrides.amount ?? 5000,
    rawPayload: {},
    status: (overrides.status ?? "pending") as "pending" | "processed" | "pending_mapping" | "refunded" | "failed",
    matchedUserId: overrides.matchedUserId ?? null,
    matchedPlanId: overrides.matchedPlanId ?? null,
    createdOrderId: overrides.createdOrderId ?? null,
    portalyCreatedAt: new Date(),
  }).returning({ id: portalyMarketplaceEvents.id });
  return { id: record!.id };
}

// ─── Cleanup ───

/**
 * Clean all test data from the database.
 * Only for an explicitly confirmed, disposable loopback database.
 * Check the actual pool target as well as the current environment before deletes.
 */
export async function cleanTestData(): Promise<void> {
  if (typeof dbPool.options.connectionString !== "string") {
    throw new Error("Safety: test database pool has no explicit connection URL.");
  }
  requireTestDatabaseUrl(process.env, dbPool.options.connectionString);
  const tables = [
    "user_agent_information_reads",
    "user_api_tokens",
    "agent_information_events",
    "agent_information_items",
    "skill_releases",
    "skills",
    "library_entries",
    "entitlement_outbox",
    "webhook_logs",
    "events_raw",
    "job_runs",
    "portaly_marketplace_events",
    "user_purchases",
    "orders",
    "plan_courses",
    "lessons",
    "chapters",
    "courses",
    "service_configs",
    "agent_api_keys",
    "content_revisions",
    "audit_logs",
    "plan_contents",
    "plan_presentations",
    "portaly_product_mappings",
    "user_discord_links",
    "discord_role_mappings",
    "media",
    "operation_snapshots",
  ];
  // Single TRUNCATE statement — atomic, no FK ordering needed
  await db.transaction(async (tx) => {
    for (const table of tables) {
      await tx.execute(sql.raw(`DELETE FROM "${table}"`));
    }
  // Clean test users separately (preserve non-test users if any)
    await tx.execute(sql`DELETE FROM users WHERE email LIKE 'test-%@example.com'`);
  });
}

// ─── Response helpers ───

export async function parseJson(response: Response): Promise<unknown> {
  return response.json();
}
