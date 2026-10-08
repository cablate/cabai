import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { courses, orders, planContents, planCourses, planPresentations, plans, serviceConfigs, userPurchases } from "@/lib/db/schema";
import { computeChanges, writeAuditLog } from "@/lib/audit";
import { validatePlanSlug } from "@/lib/validate-plan-slug";
import { bindMediaAssetsFromContent } from "@/lib/media-assets";
import { orphanMediaByEntity } from "@/lib/media-cleanup";
import { createRevision } from "@/lib/versioning";
import { generateServiceApiKey } from "@/lib/webhook-verify";
import { assertSafeOutboundUrl } from "@/lib/url-safety";
import { expirePublicSiteCache } from "@/lib/public-site-cache-invalidation";

export type AgentPlanActor = { agentId: string; name: string };

export type CreateAgentPlanInput = {
  id?: string; slug: string | null; name: string; description?: string | null;
  amount: number; currency: string; billingPeriod: "monthly" | "yearly" | "one-time";
  pricingType: "fixed" | "dynamic"; status: "active" | "inactive";
  purchaseButtonMode: "internal" | "external" | "disabled" | "free_claim";
  hasPlatformContent: boolean; hasExternalService: boolean; image?: string | null;
};

export async function createAgentPlan(input: CreateAgentPlanInput, actor: AgentPlanActor) {
  const planId = input.id ?? crypto.randomUUID();
  if (input.id && await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { id: true } })) {
    return { kind: "id-conflict" as const };
  }
  if (input.slug && await db.query.plans.findFirst({ where: eq(plans.slug, input.slug), columns: { id: true } })) {
    return { kind: "slug-conflict" as const };
  }
  try {
    await db.insert(plans).values({ ...input, id: planId, gateway: "manual", syncedAt: new Date() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("idx_plans_slug_unique")) return { kind: "slug-conflict" as const };
    if (message.includes("duplicate key") || message.includes("unique")) return { kind: "id-conflict" as const };
    throw error;
  }
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "create", entityType: "plan", entityId: planId,
    metadata: { agentName: actor.name, name: input.name, amount: input.amount, purchaseButtonMode: input.purchaseButtonMode } });
  return { kind: "created" as const, data: { id: planId, slug: input.slug, name: input.name, amount: input.amount,
    billingPeriod: input.billingPeriod, status: input.status, purchaseButtonMode: input.purchaseButtonMode } };
}

export async function listAgentPlans() {
  const rows = await db.select({ id: plans.id, name: plans.name, displayName: planPresentations.title,
    description: plans.description, amount: plans.amount, currency: plans.currency, billingPeriod: plans.billingPeriod,
    status: plans.status, hasPlatformContent: plans.hasPlatformContent, hasExternalService: plans.hasExternalService,
    syncedAt: plans.syncedAt }).from(plans).leftJoin(planPresentations, eq(plans.id, planPresentations.planId)).orderBy(desc(plans.syncedAt));
  return rows.map((plan) => ({ ...plan, displayName: plan.displayName || plan.name }));
}

export async function bindCourseToPlan(planId: string, courseId: string, actor: AgentPlanActor) {
  if (!await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { id: true } })) return { kind: "plan-not-found" as const };
  const course = await db.query.courses.findFirst({ where: and(eq(courses.id, courseId), isNull(courses.deletedAt)), columns: { id: true, title: true } });
  if (!course) return { kind: "course-not-found" as const };
  const existing = await db.query.planCourses.findFirst({ where: and(eq(planCourses.planId, planId), eq(planCourses.courseId, courseId)) });
  if (existing && !existing.removedAt) return { kind: "already-bound" as const, id: existing.id };
  let mappingId: string;
  if (existing) { await db.update(planCourses).set({ removedAt: null }).where(eq(planCourses.id, existing.id)); mappingId = existing.id; }
  else { const [created] = await db.insert(planCourses).values({ planId, courseId }).returning({ id: planCourses.id }); if (!created) throw new Error("Insert returned no rows"); mappingId = created.id; }
  await db.update(plans).set({ hasPlatformContent: true }).where(eq(plans.id, planId));
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "create", entityType: "planCourse", entityId: mappingId,
    metadata: { agentName: actor.name, planId, courseId, courseTitle: course.title } });
  return { kind: "bound" as const, data: { id: mappingId, planId, courseId } };
}

export async function unbindCourseFromPlan(planId: string, courseId: string, actor: AgentPlanActor) {
  const mapping = await db.query.planCourses.findFirst({ where: and(eq(planCourses.planId, planId), eq(planCourses.courseId, courseId), isNull(planCourses.removedAt)) });
  if (!mapping) return { kind: "not-found" as const };
  await db.update(planCourses).set({ removedAt: new Date() }).where(eq(planCourses.id, mapping.id));
  await refreshPlanPlatformContentFlag(planId);
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "delete", entityType: "planCourse", entityId: mapping.id,
    metadata: { agentName: actor.name, planId, courseId } });
  return { kind: "unbound" as const, data: { removed: true, planId, courseId } };
}

export async function setPlanPresentationPublished(planId: string, published: boolean, actor: AgentPlanActor) {
  if (!await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { id: true } })) return { kind: "plan-not-found" as const };
  const existing = await db.query.planPresentations.findFirst({ where: eq(planPresentations.planId, planId) });
  if (!existing) return { kind: "presentation-not-found" as const };
  await db.update(planPresentations).set({ publishedAt: published ? new Date() : null, updatedAt: new Date() }).where(eq(planPresentations.planId, planId));
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: published ? "publish" : "unpublish",
    entityType: "planPresentation", entityId: existing.id, metadata: { agentName: actor.name, planId } });
  expirePublicSiteCache("plans");
  return { kind: "updated" as const, id: existing.id };
}

export type UpdateAgentPlanInput = { status?: "active" | "inactive"; image?: string | null; merchantPlanId?: string | null; name?: string; description?: string | null; slug?: string | null };
export async function updateAgentPlan(planId: string, input: UpdateAgentPlanInput, actor: AgentPlanActor) {
  const existing = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
  if (!existing) return { kind: "not-found" as const };
  if (input.status === "inactive" && existing.status === "active") {
    const active = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.planId, planId), eq(orders.status, "completed"), inArray(orders.subscriptionStatus, ["active", "past_due"])));
    if (active.length) return { kind: "active-subscriptions" as const, count: active.length };
  }
  const update: Record<string, unknown> = { syncedAt: new Date() };
  for (const key of ["status", "image", "merchantPlanId", "name", "description"] as const) if (input[key] !== undefined) update[key] = input[key];
  if (input.slug !== undefined) {
    if (input.slug === null || input.slug.trim() === "") { if (existing.slug !== null) update.slug = null; }
    else { const valid = validatePlanSlug(input.slug); if (!valid.ok) return { kind: "invalid-slug" as const, message: valid.message };
      if (valid.slug !== existing.slug) { if (await db.query.plans.findFirst({ where: and(eq(plans.slug, valid.slug), ne(plans.id, planId)), columns: { id: true } })) return { kind: "slug-conflict" as const }; update.slug = valid.slug; } }
  }
  try { await db.update(plans).set(update).where(eq(plans.id, planId)); }
  catch (error) { const message = error instanceof Error ? error.message : String(error); if (message.includes("idx_plans_slug_unique") || message.includes("unique")) return { kind: "slug-conflict" as const }; throw error; }
  const nextSlug = update.slug !== undefined ? update.slug as string | null : existing.slug;
  const changes = computeChanges({ status: existing.status, image: existing.image, merchantPlanId: existing.merchantPlanId, name: existing.name, description: existing.description, slug: existing.slug },
    { status: input.status ?? existing.status, image: input.image !== undefined ? input.image : existing.image, merchantPlanId: input.merchantPlanId !== undefined ? input.merchantPlanId : existing.merchantPlanId, name: input.name ?? existing.name, description: input.description !== undefined ? input.description : existing.description, slug: nextSlug });
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "update", entityType: "plan", entityId: planId, changes, metadata: { agentName: actor.name } });
  expirePublicSiteCache("plans");
  return { kind: "updated" as const };
}

export async function deleteAgentPlan(planId: string, actor: AgentPlanActor) {
  const existing = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
  if (!existing) return { kind: "not-found" as const };
  const [orderHit, purchaseHit] = await Promise.all([db.select({ id: orders.id }).from(orders).where(eq(orders.planId, planId)).limit(1), db.select({ id: userPurchases.id }).from(userPurchases).where(eq(userPurchases.planId, planId)).limit(1)]);
  if (orderHit.length || purchaseHit.length) { await db.update(plans).set({ status: "inactive", syncedAt: new Date() }).where(eq(plans.id, planId));
    void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "update", entityType: "plan", entityId: planId, changes: { status: { before: existing.status, after: "inactive" } }, metadata: { agentName: actor.name, reason: "delete_requested_archived_due_to_activity" } }); expirePublicSiteCache("plans"); return { kind: "archived" as const }; }
  await db.transaction(async (tx) => { await tx.delete(planCourses).where(eq(planCourses.planId, planId)); await tx.delete(planContents).where(eq(planContents.planId, planId)); await tx.delete(planPresentations).where(eq(planPresentations.planId, planId)); await tx.delete(plans).where(eq(plans.id, planId)); });
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "delete", entityType: "plan", entityId: planId, metadata: { agentName: actor.name, planName: existing.name } });
  expirePublicSiteCache("plans");
  return { kind: "deleted" as const };
}
export async function getAgentPlanPresentation(planId: string) {
  if (!await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { id: true } })) return { kind: "plan-not-found" as const };
  return { kind: "found" as const, data: await db.query.planPresentations.findFirst({ where: eq(planPresentations.planId, planId) }) ?? null };
}
export async function upsertAgentPlanPresentation(planId: string, input: Record<string, unknown>, actor: AgentPlanActor) {
  if (!await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { id: true } })) return { kind: "plan-not-found" as const };
  const existing = await db.query.planPresentations.findFirst({ where: eq(planPresentations.planId, planId) });
  if (existing) await createRevision("planPresentation", existing.id, existing as unknown as Record<string, unknown>, actor.agentId);
  if (!existing && (!input.offeringType || !input.title)) return { kind: "missing-required" as const };
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["offeringType","title","subtitle","description","coverImage","bannerImage","ctaLabel","trustNotesJson","isFeatured","featuredSortOrder"] as const) if (input[key] !== undefined) update[key] = input[key];
  if (input.metadataJson !== undefined) update.metadataJson = { ...((existing?.metadataJson ?? {}) as Record<string, unknown>), ...(input.metadataJson as Record<string, unknown>) };
  let id: string;
  if (existing) { await db.update(planPresentations).set(update).where(eq(planPresentations.planId, planId)); id = existing.id;
    void writeAuditLog({ actorType:"agent", actorId:actor.agentId, action:"update", entityType:"planPresentation", entityId:id, changes:computeChanges({title:existing.title,offeringType:existing.offeringType,description:existing.description},{title:(input.title??existing.title) as string,offeringType:(input.offeringType??existing.offeringType) as typeof existing.offeringType,description:input.description!==undefined?input.description:existing.description}), metadata:{agentName:actor.name,planId} });
  } else { const [created] = await db.insert(planPresentations).values({ planId, offeringType: input.offeringType as "course", title: input.title as string, subtitle:(input.subtitle as string|null)??null, description:(input.description as string|null)??null, coverImage:(input.coverImage as string|null)??null, bannerImage:(input.bannerImage as string|null)??null, ctaLabel:(input.ctaLabel as string|null)??null, metadataJson:(input.metadataJson as Record<string,unknown>|null)??null, trustNotesJson:(input.trustNotesJson as never)??null, isFeatured:(input.isFeatured as boolean)??false, featuredSortOrder:(input.featuredSortOrder as number|null)??null }).returning({id:planPresentations.id}); if(!created) throw new Error("Insert returned no rows"); id=created.id;
    void writeAuditLog({actorType:"agent",actorId:actor.agentId,action:"create",entityType:"planPresentation",entityId:id,metadata:{agentName:actor.name,planId,title:input.title,offeringType:input.offeringType}}); }
  expirePublicSiteCache("plans");
  return { kind:"updated" as const, id };
}

/** Recompute the denormalized delivery flag after a plan-content mutation. */
export async function refreshPlanPlatformContentFlag(planId: string): Promise<void> {
  const [[courseCount], [contentCount]] = await Promise.all([
    db.select({ value: count() })
      .from(planCourses)
      .where(and(eq(planCourses.planId, planId), isNull(planCourses.removedAt))),
    db.select({ value: count() })
      .from(planContents)
      .where(and(eq(planContents.planId, planId), isNull(planContents.deletedAt))),
  ]);

  await db
    .update(plans)
    .set({ hasPlatformContent: (courseCount?.value ?? 0) + (contentCount?.value ?? 0) > 0 })
    .where(eq(plans.id, planId));
}

/** Recompute the denormalized external-service flag after a service mutation. */
export async function refreshPlanExternalServiceFlag(planId: string): Promise<void> {
  const [activeCount] = await db
    .select({ value: count() })
    .from(serviceConfigs)
    .where(
      and(
        eq(serviceConfigs.planId, planId),
        eq(serviceConfigs.isActive, true),
        isNull(serviceConfigs.deletedAt),
      ),
    );

  await db
    .update(plans)
    .set({ hasExternalService: (activeCount?.value ?? 0) > 0 })
    .where(eq(plans.id, planId));
}

export type PlanContentInput = { title: string; type: "video" | "pdf" | "text" | "download"; content: string; sortOrder?: number };
export async function listAgentPlanContents(planId: string, includeDeleted: boolean) {
  if (!await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { id: true } })) return { kind: "plan-not-found" as const };
  const where = includeDeleted ? eq(planContents.planId, planId) : and(eq(planContents.planId, planId), isNull(planContents.deletedAt));
  return { kind: "listed" as const, data: await db.select().from(planContents).where(where).orderBy(asc(planContents.sortOrder)) };
}
export async function createAgentPlanContent(planId: string, input: PlanContentInput, actor: AgentPlanActor) {
  if (!await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { id: true } })) return { kind: "plan-not-found" as const };
  const [data] = await db.insert(planContents).values({ ...input, planId, sortOrder: input.sortOrder ?? 0 }).returning(); if (!data) throw new Error("Insert returned no rows");
  await bindMediaAssetsFromContent(input.content, "planContent", data.id); await refreshPlanPlatformContentFlag(planId);
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "create", entityType: "planContent", entityId: data.id, metadata: { agentName: actor.name, planId, title: input.title, type: input.type } });
  return { kind: "created" as const, data };
}
export async function updateAgentPlanContent(planId: string, contentId: string, input: Partial<PlanContentInput>, actor: AgentPlanActor) {
  const old = await db.query.planContents.findFirst({ where: and(eq(planContents.id, contentId), eq(planContents.planId, planId), isNull(planContents.deletedAt)) }); if (!old) return { kind: "not-found" as const };
  await createRevision("planContent", old.id, old as unknown as Record<string, unknown>, actor.agentId);
  await db.update(planContents).set({ ...input, updatedAt: new Date() }).where(eq(planContents.id, contentId)); if (input.content !== undefined) await bindMediaAssetsFromContent(input.content, "planContent", contentId);
  const changes = computeChanges({ title: old.title, type: old.type, content: old.content, sortOrder: old.sortOrder }, { title: input.title ?? old.title, type: input.type ?? old.type, content: input.content ?? old.content, sortOrder: input.sortOrder ?? old.sortOrder });
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "update", entityType: "planContent", entityId: contentId, changes, metadata: { agentName: actor.name, planId } }); return { kind: "updated" as const };
}
export async function deleteAgentPlanContent(planId: string, contentId: string, actor: AgentPlanActor) {
  const old = await db.query.planContents.findFirst({ where: and(eq(planContents.id, contentId), eq(planContents.planId, planId), isNull(planContents.deletedAt)) }); if (!old) return { kind: "not-found" as const };
  await db.update(planContents).set({ deletedAt: new Date(), deletedBy: actor.agentId, updatedAt: new Date() }).where(eq(planContents.id, contentId)); await orphanMediaByEntity("planContent", contentId); await refreshPlanPlatformContentFlag(planId);
  void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "delete", entityType: "planContent", entityId: contentId, metadata: { agentName: actor.name, planId, title: old.title, softDelete: true } }); return { kind: "deleted" as const };
}
export type PlanServiceInput = { serviceName: string; webhookUrl: string; identityField?: string; configJson?: string };
export async function listAgentPlanServices(planId: string) {
  if (!await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { id: true } })) return { kind: "plan-not-found" as const };
  return { kind: "listed" as const, data: await db.select({ id: serviceConfigs.id, planId: serviceConfigs.planId, serviceName: serviceConfigs.serviceName, webhookUrl: serviceConfigs.webhookUrl, apiKeyPrefix: serviceConfigs.apiKeyPrefix, identityField: serviceConfigs.identityField, configJson: serviceConfigs.configJson, isActive: serviceConfigs.isActive, createdAt: serviceConfigs.createdAt, updatedAt: serviceConfigs.updatedAt }).from(serviceConfigs).where(and(eq(serviceConfigs.planId, planId), isNull(serviceConfigs.deletedAt))) };
}
export async function createAgentPlanService(planId: string, input: PlanServiceInput, actor: AgentPlanActor) {
  if (!await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { id: true } })) return { kind: "plan-not-found" as const };
  try { await assertSafeOutboundUrl(input.webhookUrl); } catch (error) { return { kind: "unsafe-url" as const, error: error instanceof Error ? error.message : "Unsafe webhook URL" }; }
  const key = generateServiceApiKey(); const [data] = await db.insert(serviceConfigs).values({ planId, serviceName: input.serviceName, webhookUrl: input.webhookUrl, apiKeyPrefix: key.prefix, apiKeyHash: key.hash, identityField: input.identityField ?? "email", configJson: input.configJson ?? null }).returning({ id: serviceConfigs.id, planId: serviceConfigs.planId, serviceName: serviceConfigs.serviceName, webhookUrl: serviceConfigs.webhookUrl, apiKeyPrefix: serviceConfigs.apiKeyPrefix, identityField: serviceConfigs.identityField, isActive: serviceConfigs.isActive, createdAt: serviceConfigs.createdAt }); if (!data) throw new Error("Insert returned no rows");
  await db.update(plans).set({ hasExternalService: true }).where(eq(plans.id, planId)); void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "create", entityType: "serviceConfig", entityId: data.id, metadata: { agentName: actor.name, planId, serviceName: input.serviceName } }); return { kind: "created" as const, data: { ...data, apiKey: key.plainKey } };
}
export type PlanServiceUpdate = { webhookUrl?: string; identityField?: string; configJson?: string | null; isActive?: boolean };
export async function updateAgentPlanService(planId: string, serviceId: string, input: PlanServiceUpdate, actor: AgentPlanActor) {
  const old = await db.query.serviceConfigs.findFirst({ where: and(eq(serviceConfigs.id, serviceId), eq(serviceConfigs.planId, planId), isNull(serviceConfigs.deletedAt)) }); if (!old) return { kind: "not-found" as const };
  if (input.webhookUrl !== undefined) { try { await assertSafeOutboundUrl(input.webhookUrl); } catch (error) { return { kind: "unsafe-url" as const, error: error instanceof Error ? error.message : "Unsafe webhook URL" }; } }
  await db.update(serviceConfigs).set({ ...input, updatedAt: new Date() }).where(eq(serviceConfigs.id, serviceId)); if (input.isActive !== undefined) await refreshPlanExternalServiceFlag(planId);
  const changes = computeChanges({ webhookUrl: old.webhookUrl, identityField: old.identityField, isActive: old.isActive }, { webhookUrl: input.webhookUrl ?? old.webhookUrl, identityField: input.identityField ?? old.identityField, isActive: input.isActive ?? old.isActive }); void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "update", entityType: "serviceConfig", entityId: serviceId, changes, metadata: { agentName: actor.name, planId } }); return { kind: "updated" as const };
}
export async function deleteAgentPlanService(planId: string, serviceId: string, actor: AgentPlanActor) { const old = await db.query.serviceConfigs.findFirst({ where: and(eq(serviceConfigs.id, serviceId), eq(serviceConfigs.planId, planId), isNull(serviceConfigs.deletedAt)) }); if (!old) return { kind: "not-found" as const }; await db.update(serviceConfigs).set({ deletedAt: new Date(), deletedBy: actor.agentId, updatedAt: new Date() }).where(eq(serviceConfigs.id, serviceId)); await refreshPlanExternalServiceFlag(planId); void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "delete", entityType: "serviceConfig", entityId: serviceId, metadata: { agentName: actor.name, planId, serviceName: old.serviceName, softDelete: true } }); return { kind: "deleted" as const }; }
export async function restoreAgentPlanService(planId: string, serviceId: string, actor: AgentPlanActor) { const old = await db.query.serviceConfigs.findFirst({ where: and(eq(serviceConfigs.id, serviceId), eq(serviceConfigs.planId, planId), isNotNull(serviceConfigs.deletedAt)) }); if (!old) return { kind: "not-found" as const }; await db.update(serviceConfigs).set({ deletedAt: null, deletedBy: null, updatedAt: new Date() }).where(eq(serviceConfigs.id, serviceId)); await refreshPlanExternalServiceFlag(planId); void writeAuditLog({ actorType: "agent", actorId: actor.agentId, action: "restore", entityType: "serviceConfig", entityId: serviceId, metadata: { agentName: actor.name, planId, serviceName: old.serviceName } }); return { kind: "restored" as const }; }
