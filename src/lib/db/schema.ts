import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  jsonb,
  varchar,
  check,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Auth.js tables ───

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  role: text("role", { enum: ["member", "admin"] })
    .notNull()
    .default("member"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  autoMarkComplete: boolean("auto_mark_complete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const accounts = pgTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

// ─── Business tables ───

export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // Local product / entitlement id
  providerPlanId: text("provider_plan_id"), // Payment-provider plan id, defaults to id for legacy Portaly plans
  slug: text("slug"), // Optional URL-friendly identifier; partial unique when set
  name: text("name").notNull(),
  description: text("description"),
  amount: integer("amount").notNull(), // TWD
  currency: text("currency").notNull().default("TWD"),
  billingPeriod: text("billing_period", {
    enum: ["monthly", "yearly", "one-time"],
  }).notNull(),
  pricingType: text("pricing_type", { enum: ["fixed", "dynamic"] }),
  status: text("status", { enum: ["active", "inactive"] })
    .notNull()
    .default("active"),
  image: text("image"),
  merchantPlanId: text("merchant_plan_id"),
  hasPlatformContent: boolean("has_platform_content")
    .notNull()
    .default(false),
  hasExternalService: boolean("has_external_service")
    .notNull()
    .default(false),
  gateway: text("gateway", { enum: ["portaly", "manual"] })
    .notNull()
    .default("portaly"),
  purchaseButtonMode: text("purchase_button_mode", {
    enum: ["internal", "external", "disabled", "free_claim"],
  })
    .notNull()
    .default("internal"),
  externalCheckoutUrl: text("external_checkout_url"),
  externalCheckoutLabel: text("external_checkout_label"),
  externalCheckoutNewTab: boolean("external_checkout_new_tab")
    .notNull()
    .default(true),
  portalyCreatedAt: text("portaly_created_at"),
  portalyUpdatedAt: text("portaly_updated_at"),
  syncedAt: timestamp("synced_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  // Slug is optional but must be globally unique when set. Partial index
  // skips NULL rows so existing plans aren't backfilled.
  uniqueSlug: uniqueIndex("idx_plans_slug_unique")
    .on(table.slug)
    .where(sql`slug IS NOT NULL`),
}));

export const planContents = pgTable("plan_contents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id), // FK to plans
  title: text("title").notNull(),
  type: text("type", {
    enum: ["video", "pdf", "text", "download"],
  }).notNull(),
  content: text("content").notNull(), // URL or text content
  sortOrder: integer("sort_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const orders = pgTable("orders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id), // FK to plans
  merchantOrderNumber: text("merchant_order_number").notNull().unique(),
  providerPlanId: text("provider_plan_id"),
  providerMode: text("provider_mode", { enum: ["test", "live"] }),
  portalySessionId: text("portaly_session_id").unique(),
  subscriptionId: text("subscription_id"),
  status: text("status", {
    enum: ["pending", "completed", "failed", "canceled", "refunded", "expired"],
  })
    .notNull()
    .default("pending"),
  currency: varchar("currency", { length: 3 }).notNull().default("TWD"),
  expectedAmount: integer("expected_amount"),
  expectedCurrency: varchar("expected_currency", { length: 3 }),
  paidAmount: integer("paid_amount"), // full units from Portaly callback
  paymentMethod: text("payment_method"),
  callbackPayload: jsonb("callback_payload"), // raw JSON from Portaly callback
  refundAmount: integer("refund_amount"),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  refundReason: text("refund_reason"),
  checkoutUrl: text("checkout_url"), // Portaly hosted checkout URL — for pending order reuse
  checkoutReservationExpiresAt: timestamp("checkout_reservation_expires_at", { withTimezone: true }),
  checkoutSessionExpiresAt: timestamp("checkout_session_expires_at", { withTimezone: true }),
  subscriptionStatus: text("subscription_status"), // 'active' | 'past_due' | 'canceled' | 'expired'
  cancelAtPeriodEnd: boolean("cancel_at_period_end"),
  cancelEffectiveAt: timestamp("cancel_effective_at", { withTimezone: true }),
  nextBillingAt: timestamp("next_billing_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  userIdx: index("idx_orders_user_id").on(table.userId),
  statusIdx: index("idx_orders_status").on(table.status),
  planIdx: index("idx_orders_plan_id").on(table.planId),
  userPlanStatusIdx: index("idx_orders_user_plan_status").on(table.userId, table.planId, table.status),
  uniquePendingCheckout: uniqueIndex("idx_orders_one_pending_checkout")
    .on(table.userId, table.planId)
    .where(sql`status = 'pending'`),
}));

export const userPurchases = pgTable("user_purchases", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id), // FK to plans
  orderId: text("order_id").references(() => orders.id),
  grantedAt: timestamp("granted_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = permanent
  grantedBy: text("granted_by", {
    enum: ["payment", "manual", "free_claim"],
  })
    .notNull()
    .default("payment"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by"), // admin userId or "system"
}, (table) => ({
  // Prevent duplicate payment-based purchases for the same order.
  // Manual grants (orderId = NULL) are exempt because NULL != NULL in Postgres UNIQUE.
  uniqueUserPlanOrder: uniqueIndex("idx_user_purchases_unique")
    .on(table.userId, table.planId, table.orderId),
  // One active free_claim per (user, plan); revoked rows are excluded so a
  // revoked claim can be re-granted.
  uniqueFreeClaim: uniqueIndex("idx_user_purchases_free_claim_unique")
    .on(table.userId, table.planId)
    .where(sql`granted_by = 'free_claim' AND revoked_at IS NULL`),
}));

// ─── Entitlement Hub tables ───

export const serviceConfigs = pgTable("service_configs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  serviceName: text("service_name").notNull(), // 'investment-monitor' | 'discord-bot' | ...
  webhookUrl: text("webhook_url").notNull(),
  apiKeyPrefix: text("api_key_prefix").notNull(), // first 8 chars for fast lookup
  apiKeyHash: text("api_key_hash").notNull(), // SHA-256 hash of full API key
  identityField: text("identity_field").notNull().default("email"),
  configJson: text("config_json"), // service-specific JSON config (kept as text for simplicity)
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  uniquePlanService: uniqueIndex("idx_service_configs_plan_service")
    .on(table.planId, table.serviceName),
}));

export const webhookLogs = pgTable("webhook_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  serviceConfigId: text("service_config_id").notNull(),
  orderId: text("order_id"), // nullable — for tracking which order triggered this
  userId: text("user_id"), // nullable — for L2 cooldown dedup
  eventType: text("event_type").notNull(), // 'entitlement.granted' | 'entitlement.revoked' | 'entitlement.renewed'
  payloadJson: text("payload_json").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status", {
    enum: ["pending", "processing", "sent", "failed", "dead_letter"],
  })
    .notNull()
    .default("pending"),
  httpStatus: integer("http_status"),
  attempts: integer("attempts").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  statusRetryIdx: index("idx_webhook_logs_status_retry")
    .on(table.status, table.nextRetryAt),
  lockIdx: index("idx_webhook_logs_lock")
    .on(table.status, table.lockedAt),
}));

// ─── Course tables ───

export const courses = pgTable("courses", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  image: text("image"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("course_status", { enum: ["draft", "published", "archived"] })
    .notNull()
    .default("draft"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ─── Plan ↔ Course junction (many-to-many) ───

export const planCourses = pgTable("plan_courses", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id),
  removedAt: timestamp("removed_at", { withTimezone: true }), // grandfather: null = active, set = removed but grandfathered
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  uniquePlanCourse: uniqueIndex("idx_plan_courses_plan_course")
    .on(table.planId, table.courseId),
}));

export const chapters = pgTable("chapters", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  defaultExpanded: boolean("default_expanded").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const lessons = pgTable("lessons", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id")
    .notNull()
    .references(() => chapters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: text("type", {
    enum: ["video", "text", "pdf", "download"],
  }).notNull(),
  content: text("content").notNull(), // URL or raw content
  resourcesJson: jsonb("resources_json").notNull().default(sql`'[]'::jsonb`),
  duration: integer("duration"), // seconds (for video)
  sortOrder: integer("sort_order").notNull().default(0),
  isPreview: boolean("is_preview").notNull().default(false),
  status: text("lesson_status", { enum: ["draft", "published"] })
    .notNull()
    .default("draft"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: text("deleted_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const userProgress = pgTable("user_progress", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  completed: boolean("completed").notNull().default(false),
  progress: integer("progress").notNull().default(0), // 0-100 percentage
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  uniqueUserLesson: uniqueIndex("idx_user_progress_unique")
    .on(table.userId, table.lessonId),
}));

// ─── Media Registry ───

export const media = pgTable("media", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  storageKey: text("storage_key").notNull().unique(),
  publicUrl: text("public_url").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  context: text("context", {
    enum: [
      "plan-cover",
      "plan-banner",
      "course-image",
      "lesson-thumbnail",
      "lesson-content",
      "service-guide",
      "skill-artifact",
    ],
  }).notNull(),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  status: text("media_status", {
    enum: ["pending", "confirmed", "orphaned", "deleted"],
  })
    .notNull()
    .default("pending"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (table) => ({
  statusIdx: index("idx_media_status").on(table.status),
  entityIdx: index("idx_media_entity").on(table.entityType, table.entityId),
  uploaderIdx: index("idx_media_uploader").on(table.uploadedBy),
}));

// ─── Audit Logs ───

export const auditLogs = pgTable("audit_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  actorType: text("actor_type", {
    enum: ["user", "agent", "system"],
  }).notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  changes: jsonb("changes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  entityIdx: index("idx_audit_logs_entity").on(table.entityType, table.entityId),
  actorIdx: index("idx_audit_logs_actor").on(table.actorType, table.actorId),
  createdAtIdx: index("idx_audit_logs_created_at").on(table.createdAt),
}));

// ─── Distributed Rate Limit Windows ───

export const rateLimitWindows = pgTable("rate_limit_windows", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  updatedAtIdx: index("idx_rate_limit_windows_updated_at").on(table.updatedAt),
}));

// ─── Content Revisions ───

export const contentRevisions = pgTable("content_revisions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  changedBy: text("changed_by").notNull(),
  changeReason: text("change_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  entityVersionIdx: uniqueIndex("idx_content_revisions_entity_version")
    .on(table.entityType, table.entityId, table.version),
}));

// ─── Operation Snapshots (Layer 1 backup) ───

export const operationSnapshots = pgTable("operation_snapshots", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  operation: text("operation").notNull(),
  tablesData: jsonb("tables_data").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ─── Presentation Layer ───

export const planPresentations = pgTable(
  "plan_presentations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Foreign key to Portaly plan
    planId: text("plan_id")
      .notNull()
      .unique() // One presentation per plan
      .references(() => plans.id, { onDelete: "cascade" }),

    // Offering type — determines UI rendering and metadata schema
    offeringType: text("offering_type", {
      enum: [
        "course",
        "lecture",
        "free_event",
        "offline_event",
        "service",
        "membership",
        "download",
      ],
    }).notNull(),

    // Frontend display fields
    title: text("title").notNull(), // Frontend title (can differ from plan.name)
    subtitle: text("subtitle"), // Short subtitle or tagline
    description: text("description"), // Long-form description (can be > plan.description)

    // Media
    coverImage: text("cover_image"), // Primary image URL (from R2)
    bannerImage: text("banner_image"), // Optional banner for featured display (from R2)

    // Call-to-action
    ctaLabel: text("cta_label"), // e.g., "Enroll Now", "Join Event", "Book Service"

    // Type-specific metadata as JSONB
    // Schema depends on offeringType (see discriminated union in validation)
    metadataJson: jsonb("metadata_json"),

    // Trust/FAQ notes — user-generated content to build confidence
    // Can include refund policy summary, FAQ, testimonial links, etc.
    trustNotesJson: jsonb("trust_notes_json"),

    // Featured banner eligibility
    isFeatured: boolean("is_featured").notNull().default(false),
    featuredSortOrder: integer("featured_sort_order"), // Null if not featured

    // Publication state
    // null = draft, Date = published
    publishedAt: timestamp("published_at", { withTimezone: true }),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    // Index for featured queries
    featuredIdx: index("idx_plan_presentations_featured").on(
      table.isFeatured,
      table.featuredSortOrder
    ),
    // Index for type filtering
    typeIdx: index("idx_plan_presentations_type").on(table.offeringType),
    // Index for published queries
    publishedIdx: index("idx_plan_presentations_published").on(table.publishedAt),
  })
);

// ─── Relations ───

export const plansRelations = relations(plans, ({ many, one }) => ({
  presentation: one(planPresentations, {
    fields: [plans.id],
    references: [planPresentations.planId],
  }),
  contents: many(planContents),
  courses: many(courses),
}));

export const planPresentationsRelations = relations(
  planPresentations,
  ({ one }) => ({
    plan: one(plans, {
      fields: [planPresentations.planId],
      references: [plans.id],
    }),
  })
);

export const planContentsRelations = relations(planContents, ({ one }) => ({
  plan: one(plans, { fields: [planContents.planId], references: [plans.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  orders: many(orders),
  purchases: many(userPurchases),
  apiTokens: many(userApiTokens),
  informationReads: many(userAgentInformationReads),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
}));

export const userPurchasesRelations = relations(userPurchases, ({ one }) => ({
  user: one(users, {
    fields: [userPurchases.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [userPurchases.orderId],
    references: [orders.id],
  }),
}));

export const planCoursesRelations = relations(planCourses, ({ one }) => ({
  plan: one(plans, { fields: [planCourses.planId], references: [plans.id] }),
  course: one(courses, { fields: [planCourses.courseId], references: [courses.id] }),
}));

export const coursesRelations = relations(courses, ({ many }) => ({
  planCourses: many(planCourses),
  chapters: many(chapters),
  lessons: many(lessons),
}));

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  course: one(courses, { fields: [chapters.courseId], references: [courses.id] }),
  lessons: many(lessons),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  course: one(courses, { fields: [lessons.courseId], references: [courses.id] }),
  chapter: one(chapters, { fields: [lessons.chapterId], references: [chapters.id] }),
  progress: many(userProgress),
}));

export const userProgressRelations = relations(userProgress, ({ one }) => ({
  user: one(users, { fields: [userProgress.userId], references: [users.id] }),
  lesson: one(lessons, { fields: [userProgress.lessonId], references: [lessons.id] }),
}));

export const serviceConfigsRelations = relations(serviceConfigs, ({ many }) => ({
  webhookLogs: many(webhookLogs),
}));

export const webhookLogsRelations = relations(webhookLogs, ({ one }) => ({
  serviceConfig: one(serviceConfigs, {
    fields: [webhookLogs.serviceConfigId],
    references: [serviceConfigs.id],
  }),
}));

// ─── Agent API Keys ───

export const agentApiKeys = pgTable("agent_api_keys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  permissions: text("permissions")
    .array()
    .notNull()
    .default(sql`'{content:read}'`),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ─── User API Tokens (for external AI agent access) ───

export const userApiTokens = pgTable("user_api_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`'{course:read,skill:read,information:read,information:ack}'`),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revoked: boolean("revoked").notNull().default(false),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ─── Library, Skill, and Agent Information foundation ───

export interface AgentInformationAction {
  rel: string;
  operationId: string;
  parameters: Record<string, string | number | boolean>;
  credential: "none" | "user";
}

export const libraryEntries = pgTable("library_entries", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  bodyMarkdown: text("body_markdown").notNull(),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  featured: boolean("featured").notNull().default(false),
  status: text("status", {
    enum: ["draft", "published", "withdrawn"],
  })
    .notNull()
    .default("draft"),
  revision: integer("revision").notNull().default(1),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  slugUnique: uniqueIndex("idx_library_entries_slug_unique").on(table.slug),
  publishedFeedIdx: index("idx_library_entries_published_feed")
    .on(table.status, table.publishedAt, table.id),
  featuredIdx: index("idx_library_entries_featured")
    .on(table.featured, table.publishedAt)
    .where(sql`${table.status} = 'published'`),
  tagsIdx: index("idx_library_entries_tags").using("gin", table.tags),
  statusCheck: check(
    "chk_library_entries_status",
    sql`${table.status} IN ('draft', 'published', 'withdrawn')`,
  ),
  revisionCheck: check(
    "chk_library_entries_revision_positive",
    sql`${table.revision} >= 1`,
  ),
  lifecycleCheck: check(
    "chk_library_entries_lifecycle",
    sql`(
      (${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.withdrawnAt} IS NULL)
      OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.withdrawnAt} IS NULL)
      OR (${table.status} = 'withdrawn' AND ${table.publishedAt} IS NOT NULL AND ${table.withdrawnAt} IS NOT NULL)
    )`,
  ),
}));

export const skills = pgTable("skills", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  bodyMarkdown: text("body_markdown").notNull().default(""),
  distributionMode: text("distribution_mode", {
    enum: ["hosted", "github"],
  })
    .notNull()
    .default("hosted"),
  sourceRepositoryUrl: text("source_repository_url"),
  sourceRef: text("source_ref"),
  sourceCommitSha: text("source_commit_sha"),
  sourceVerifiedAt: timestamp("source_verified_at", { withTimezone: true }),
  status: text("status", {
    enum: ["draft", "published", "withdrawn"],
  })
    .notNull()
    .default("draft"),
  currentReleaseId: text("current_release_id"),
  revision: integer("revision").notNull().default(1),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  slugUnique: uniqueIndex("idx_skills_slug_unique").on(table.slug),
  statusIdx: index("idx_skills_status").on(table.status, table.publishedAt),
  currentReleaseIdx: index("idx_skills_current_release").on(table.currentReleaseId),
  statusCheck: check(
    "chk_skills_status",
    sql`${table.status} IN ('draft', 'published', 'withdrawn')`,
  ),
  revisionCheck: check(
    "chk_skills_revision_positive",
    sql`${table.revision} >= 1`,
  ),
  distributionCheck: check(
    "chk_skills_distribution",
    sql`(
      (${table.distributionMode} = 'hosted'
        AND ${table.sourceRepositoryUrl} IS NULL
        AND ${table.sourceRef} IS NULL
        AND ${table.sourceCommitSha} IS NULL
        AND ${table.sourceVerifiedAt} IS NULL)
      OR (${table.distributionMode} = 'github'
        AND ${table.sourceRepositoryUrl} IS NOT NULL
        AND ${table.sourceRef} IS NOT NULL
        AND (${table.sourceVerifiedAt} IS NULL OR ${table.sourceCommitSha} IS NOT NULL))
    )`,
  ),
  lifecycleCheck: check(
    "chk_skills_lifecycle",
    sql`(
      (${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.withdrawnAt} IS NULL AND ${table.currentReleaseId} IS NULL)
      OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.withdrawnAt} IS NULL AND ${table.currentReleaseId} IS NOT NULL)
      OR (${table.status} = 'withdrawn' AND ${table.publishedAt} IS NOT NULL AND ${table.withdrawnAt} IS NOT NULL)
    )`,
  ),
}));

export const skillReleases = pgTable("skill_releases", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  skillId: text("skill_id")
    .notNull()
    .references(() => skills.id),
  version: text("version").notNull(),
  artifactMediaId: text("artifact_media_id")
    .references(() => media.id),
  checksumSha256: text("checksum_sha256"),
  artifactManifest: jsonb("artifact_manifest").$type<{
    skillMarkdownSha256: string;
    name: string | null;
    description: string | null;
    fileCount: number;
    uncompressedBytes: number;
    paths: string[];
  }>(),
  artifactValidation: jsonb("artifact_validation").$type<{
    valid: boolean;
    issues: Array<{ code: string; path?: string; message: string }>;
    validatedChecksumSha256: string | null;
  }>(),
  artifactValidatedAt: timestamp("artifact_validated_at", { withTimezone: true }),
  compatibility: text("compatibility").notNull().default(""),
  license: text("license").notNull().default(""),
  contentMarkdown: text("content_markdown").notNull().default(""),
  changelogMarkdown: text("changelog_markdown").notNull().default(""),
  accessPolicy: text("access_policy", {
    enum: ["public", "authenticated"],
  })
    .notNull()
    .default("authenticated"),
  status: text("status", {
    enum: ["draft", "published", "deprecated", "withdrawn"],
  })
    .notNull()
    .default("draft"),
  revision: integer("revision").notNull().default(1),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  skillVersionUnique: uniqueIndex("idx_skill_releases_skill_version_unique")
    .on(table.skillId, table.version),
  artifactUnique: uniqueIndex("idx_skill_releases_artifact_unique")
    .on(table.artifactMediaId)
    .where(sql`${table.artifactMediaId} IS NOT NULL`),
  statusIdx: index("idx_skill_releases_status")
    .on(table.skillId, table.status, table.publishedAt),
  accessPolicyCheck: check(
    "chk_skill_releases_access_policy",
    sql`${table.accessPolicy} IN ('public', 'authenticated')`,
  ),
  statusCheck: check(
    "chk_skill_releases_status",
    sql`${table.status} IN ('draft', 'published', 'deprecated', 'withdrawn')`,
  ),
  revisionCheck: check(
    "chk_skill_releases_revision_positive",
    sql`${table.revision} >= 1`,
  ),
  checksumCheck: check(
    "chk_skill_releases_checksum",
    sql`${table.checksumSha256} IS NULL OR ${table.checksumSha256} ~ '^[0-9a-f]{64}$'`,
  ),
  artifactCheck: check(
    "chk_skill_releases_published_artifact",
    sql`${table.status} = 'draft' OR (
      (${table.artifactMediaId} IS NULL AND ${table.checksumSha256} IS NULL AND ${table.artifactManifest} IS NULL AND ${table.artifactValidation} IS NULL AND ${table.artifactValidatedAt} IS NULL)
      OR (${table.artifactMediaId} IS NOT NULL AND ${table.checksumSha256} IS NOT NULL AND ${table.artifactManifest} IS NOT NULL AND ${table.artifactValidation} IS NOT NULL AND ${table.artifactValidatedAt} IS NOT NULL)
    )`,
  ),
  lifecycleCheck: check(
    "chk_skill_releases_lifecycle",
    sql`(
      (${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.deprecatedAt} IS NULL AND ${table.withdrawnAt} IS NULL)
      OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.deprecatedAt} IS NULL AND ${table.withdrawnAt} IS NULL)
      OR (${table.status} = 'deprecated' AND ${table.publishedAt} IS NOT NULL AND ${table.deprecatedAt} IS NOT NULL AND ${table.withdrawnAt} IS NULL)
      OR (${table.status} = 'withdrawn' AND ${table.publishedAt} IS NOT NULL AND ${table.withdrawnAt} IS NOT NULL)
    )`,
  ),
}));

export const agentInformationItems = pgTable("agent_information_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dedupeKey: text("dedupe_key").notNull(),
  sourceType: text("source_type", {
    enum: ["manual_announcement", "library_entry", "skill_release", "course", "api_operation"],
  }).notNull(),
  sourceId: text("source_id").notNull(),
  sourceVersion: text("source_version").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  whyItMatters: text("why_it_matters").notNull().default(""),
  bodyMarkdown: text("body_markdown").notNull().default(""),
  audience: text("audience", {
    enum: ["all_users", "source_entitled"],
  })
    .notNull()
    .default("all_users"),
  actions: jsonb("actions")
    .$type<AgentInformationAction[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  tags: text("tags")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  status: text("status", {
    enum: ["draft", "published", "withdrawn"],
  })
    .notNull()
    .default("draft"),
  revision: integer("revision").notNull().default(1),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  dedupeUnique: uniqueIndex("idx_agent_information_dedupe_unique")
    .on(table.dedupeKey),
  sourceIdx: index("idx_agent_information_source")
    .on(table.sourceType, table.sourceId, table.sourceVersion),
  unreadFeedIdx: index("idx_agent_information_unread_feed")
    .on(table.status, table.audience, table.publishedAt, table.id),
  kindIdx: index("idx_agent_information_kind").on(table.kind, table.status),
  sourceTypeCheck: check(
    "chk_agent_information_source_type",
    sql`${table.sourceType} IN ('manual_announcement', 'library_entry', 'skill_release', 'course', 'api_operation')`,
  ),
  audienceCheck: check(
    "chk_agent_information_audience",
    sql`${table.audience} IN ('all_users', 'source_entitled')`,
  ),
  statusCheck: check(
    "chk_agent_information_status",
    sql`${table.status} IN ('draft', 'published', 'withdrawn')`,
  ),
  revisionCheck: check(
    "chk_agent_information_revision_positive",
    sql`${table.revision} >= 1`,
  ),
  lifecycleCheck: check(
    "chk_agent_information_lifecycle",
    sql`(
      (${table.status} = 'draft' AND ${table.publishedAt} IS NULL AND ${table.withdrawnAt} IS NULL)
      OR (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL AND ${table.withdrawnAt} IS NULL)
      OR (${table.status} = 'withdrawn' AND ${table.publishedAt} IS NOT NULL AND ${table.withdrawnAt} IS NOT NULL)
    )`,
  ),
  expiryCheck: check(
    "chk_agent_information_expiry",
    sql`${table.expiresAt} IS NULL OR ${table.publishedAt} IS NULL OR ${table.expiresAt} > ${table.publishedAt}`,
  ),
}));

export const agentInformationEvents = pgTable("agent_information_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  informationId: text("information_id")
    .notNull()
    .references(() => agentInformationItems.id),
  idempotencyKey: text("idempotency_key").notNull(),
  fromStatus: text("from_status", {
    enum: ["draft", "published", "withdrawn"],
  }),
  toStatus: text("to_status", {
    enum: ["draft", "published", "withdrawn"],
  }).notNull(),
  actorType: text("actor_type", {
    enum: ["user", "agent", "system"],
  }).notNull(),
  actorId: text("actor_id").notNull(),
  revision: integer("revision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  idempotencyUnique: uniqueIndex("idx_agent_information_events_idempotency_unique")
    .on(table.idempotencyKey),
  historyIdx: index("idx_agent_information_events_history")
    .on(table.informationId, table.createdAt, table.id),
  fromStatusCheck: check(
    "chk_agent_information_events_from_status",
    sql`${table.fromStatus} IS NULL OR ${table.fromStatus} IN ('draft', 'published', 'withdrawn')`,
  ),
  toStatusCheck: check(
    "chk_agent_information_events_to_status",
    sql`${table.toStatus} IN ('draft', 'published', 'withdrawn')`,
  ),
  actorTypeCheck: check(
    "chk_agent_information_events_actor_type",
    sql`${table.actorType} IN ('user', 'agent', 'system')`,
  ),
  transitionCheck: check(
    "chk_agent_information_events_transition",
    sql`${table.fromStatus} IS NULL OR ${table.fromStatus} <> ${table.toStatus}`,
  ),
  revisionCheck: check(
    "chk_agent_information_events_revision_positive",
    sql`${table.revision} >= 1`,
  ),
}));

export const userAgentInformationReads = pgTable("user_agent_information_reads", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  informationId: text("information_id")
    .notNull()
    .references(() => agentInformationItems.id),
  readAt: timestamp("read_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  primaryKey: primaryKey({
    name: "pk_user_agent_information_reads",
    columns: [table.userId, table.informationId],
  }),
  informationStatsIdx: index("idx_user_agent_information_reads_information")
    .on(table.informationId, table.readAt),
  userReadAtIdx: index("idx_user_agent_information_reads_user_time")
    .on(table.userId, table.readAt),
}));

// ─── Portaly Marketplace Integration ───

export const portalyProductMappings = pgTable("portaly_product_mappings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  portalyProductId: text("portaly_product_id").notNull().unique(),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  productName: text("product_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export const portalyMarketplaceEvents = pgTable("portaly_marketplace_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  portalyOrderId: text("portaly_order_id").notNull(),
  portalyProductId: text("portaly_product_id").notNull(),
  event: text("event", { enum: ["paid", "refund"] }).notNull(),
  customerEmail: text("customer_email").notNull(),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("TWD"),
  discount: integer("discount").notNull().default(0),
  feeAmount: integer("fee_amount").notNull().default(0),
  netTotal: integer("net_total").notNull().default(0),
  paymentMethod: text("payment_method"),
  couponCode: text("coupon_code"),
  rawPayload: jsonb("raw_payload").notNull(),
  status: text("status", {
    enum: ["pending", "processed", "pending_mapping", "refunded", "failed"],
  }).notNull().default("pending"),
  matchedUserId: text("matched_user_id").references(() => users.id),
  matchedPlanId: text("matched_plan_id").references(() => plans.id),
  createdOrderId: text("created_order_id").references(() => orders.id),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  portalyCreatedAt: timestamp("portaly_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  orderEventUnique: uniqueIndex("idx_mkt_events_order_event").on(table.portalyOrderId, table.event),
  statusIdx: index("idx_mkt_events_status").on(table.status),
  productIdx: index("idx_mkt_events_product").on(table.portalyProductId),
  emailIdx: index("idx_mkt_events_email").on(table.customerEmail),
}));

// ─── Discord Integration ───

export const userDiscordLinks = pgTable("user_discord_links", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  discordId: text("discord_id").notNull().unique(),
  discordUsername: text("discord_username"),
  linkedAt: timestamp("linked_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
});

export const discordRoleMappings = pgTable("discord_role_mappings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  roleId: text("role_id").notNull(),
  roleName: text("role_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  uniquePlanRole: uniqueIndex("idx_discord_role_mappings_plan_role")
    .on(table.planId, table.roleId),
}));

// ─── Site Config ───

export const siteConfig = pgTable("site_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
});

// ─── Operational Job Ledger ───

export const jobRuns = pgTable("job_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  jobKey: text("job_key").notNull(),
  trigger: text("trigger", {
    enum: ["in_process", "external_cron", "admin", "system"],
  }).notNull(),
  triggerId: text("trigger_id"),
  status: text("status", {
    enum: ["running", "succeeded", "failed", "skipped", "interrupted"],
  }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  safeSummary: jsonb("safe_summary")
    .$type<Record<string, number | boolean>>()
    .notNull()
    .default({}),
  errorCode: text("error_code"),
  errorSummary: text("error_summary"),
  runnerId: text("runner_id").notNull(),
  appVersion: text("app_version").notNull().default("unknown"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  latestByJobIdx: index("idx_job_runs_job_started")
    .on(table.jobKey, table.startedAt.desc()),
  retentionIdx: index("idx_job_runs_finished")
    .on(table.finishedAt)
    .where(sql`${table.finishedAt} IS NOT NULL`),
}));

// ─── Agent provider-sync previews and durable execution read-back ───

export const providerSyncChangeSets = pgTable("provider_sync_change_sets", {
  id: text("id").primaryKey(),
  operation: text("operation", { enum: ["plans", "orders", "subscriptions"] }).notNull(),
  actorId: text("actor_id").notNull(),
  sourceFingerprint: text("source_fingerprint").notNull(),
  fingerprint: text("fingerprint").notNull(),
  changes: jsonb("changes").notNull(),
  counts: jsonb("counts").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  actorCreatedIdx: index("idx_provider_sync_change_sets_actor_created")
    .on(table.actorId, table.createdAt),
  expiresAtIdx: index("idx_provider_sync_change_sets_expires")
    .on(table.expiresAt),
}));

export const providerSyncJobs = pgTable("provider_sync_jobs", {
  id: text("id").primaryKey(),
  operation: text("operation", { enum: ["plans", "orders", "subscriptions"] }).notNull(),
  actorId: text("actor_id").notNull(),
  idempotencyKeyHash: text("idempotency_key_hash").notNull(),
  recoveryKeyHash: text("recovery_key_hash"),
  changeSetId: text("change_set_id").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  snapshotId: text("snapshot_id"),
  providerSnapshot: jsonb("provider_snapshot").$type<Record<string, unknown>>(),
  status: text("status", { enum: ["queued", "running", "succeeded", "partially_failed", "stale", "failed", "interrupted", "recovered"] }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  leaseOwner: text("lease_owner"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().default(sql`now()`),
  synced: integer("synced"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  auditId: text("audit_id"),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().default(sql`now()`),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => ({
  idempotencyIdx: uniqueIndex("idx_provider_sync_jobs_idempotency")
    .on(table.operation, table.actorId, table.idempotencyKeyHash),
  actorStartedIdx: index("idx_provider_sync_jobs_actor_started")
    .on(table.actorId, table.startedAt),
  queueIdx: index("idx_provider_sync_jobs_queue")
    .on(table.status, table.nextAttemptAt, table.startedAt),
  leaseIdx: index("idx_provider_sync_jobs_lease")
    .on(table.status, table.leaseExpiresAt),
}));

/**
 * Durable local entitlement transitions.
 *
 * The row is committed in the same transaction as the purchase/order change.
 * External webhooks and Discord are consumers processed after commit by the
 * existing webhook-outbox job.
 */
export const entitlementOutbox = pgTable("entitlement_outbox", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  eventType: text("event_type", {
    enum: ["entitlement.granted", "entitlement.revoked"],
  }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  orderId: text("order_id").references(() => orders.id),
  purchaseId: text("purchase_id").references(() => userPurchases.id),
  source: text("source", {
    enum: ["payment", "subscription", "marketplace", "manual", "free_claim"],
  }).notNull(),
  triggeredBy: text("triggered_by").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  status: text("status", {
    enum: ["pending", "processing", "delivered", "failed", "dead_letter"],
  })
    .notNull()
    .default("pending"),
  webhookEnqueuedAt: timestamp("webhook_enqueued_at", { withTimezone: true }),
  discordSyncedAt: timestamp("discord_synced_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  statusRetryIdx: index("idx_entitlement_outbox_status_retry")
    .on(table.status, table.nextRetryAt),
  lockIdx: index("idx_entitlement_outbox_lock")
    .on(table.status, table.lockedAt),
  userPlanIdx: index("idx_entitlement_outbox_user_plan")
    .on(table.userId, table.planId),
}));

// ─── User Event Tracking ───

export const eventsRaw = pgTable("events_raw", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  eventType: text("event_type").notNull(),
  properties: jsonb("properties").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  source: text("source", {
    enum: [
      "web",
      "server",
      "payment_callback",
      "marketplace_import",
      "legacy",
    ],
  })
    .notNull()
    .default("legacy"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => ({
  userTypeTimeIdx: index("idx_events_user_type_time")
    .on(table.userId, table.eventType, table.createdAt),
  typeTimeIdx: index("idx_events_type_time")
    .on(table.eventType, table.createdAt),
  sourceTypeOccurredAtIdx: index("idx_events_source_type_occurred_at")
    .on(table.source, table.eventType, table.occurredAt),
  createdAtIdx: index("idx_events_created_at")
    .on(table.createdAt),
}));

// ─── Additional Relations ───

export const mediaRelations = relations(media, ({ one, many }) => ({
  uploader: one(users, { fields: [media.uploadedBy], references: [users.id] }),
  skillReleases: many(skillReleases),
}));

export const skillsRelations = relations(skills, ({ many }) => ({
  releases: many(skillReleases),
}));

export const skillReleasesRelations = relations(skillReleases, ({ one }) => ({
  skill: one(skills, {
    fields: [skillReleases.skillId],
    references: [skills.id],
  }),
  artifact: one(media, {
    fields: [skillReleases.artifactMediaId],
    references: [media.id],
  }),
}));

export const agentInformationItemsRelations = relations(
  agentInformationItems,
  ({ many }) => ({
    events: many(agentInformationEvents),
    reads: many(userAgentInformationReads),
  }),
);

export const agentInformationEventsRelations = relations(
  agentInformationEvents,
  ({ one }) => ({
    information: one(agentInformationItems, {
      fields: [agentInformationEvents.informationId],
      references: [agentInformationItems.id],
    }),
  }),
);

export const userAgentInformationReadsRelations = relations(
  userAgentInformationReads,
  ({ one }) => ({
    user: one(users, {
      fields: [userAgentInformationReads.userId],
      references: [users.id],
    }),
    information: one(agentInformationItems, {
      fields: [userAgentInformationReads.informationId],
      references: [agentInformationItems.id],
    }),
  }),
);

export const agentApiKeysRelations = relations(agentApiKeys, ({ one }) => ({
  creator: one(users, { fields: [agentApiKeys.createdBy], references: [users.id] }),
}));

export const userApiTokensRelations = relations(userApiTokens, ({ one }) => ({
  user: one(users, { fields: [userApiTokens.userId], references: [users.id] }),
}));

export const portalyProductMappingsRelations = relations(portalyProductMappings, ({ one }) => ({
  plan: one(plans, { fields: [portalyProductMappings.planId], references: [plans.id] }),
}));

export const portalyMarketplaceEventsRelations = relations(portalyMarketplaceEvents, ({ one }) => ({
  matchedUser: one(users, { fields: [portalyMarketplaceEvents.matchedUserId], references: [users.id] }),
  matchedPlan: one(plans, { fields: [portalyMarketplaceEvents.matchedPlanId], references: [plans.id] }),
  createdOrder: one(orders, { fields: [portalyMarketplaceEvents.createdOrderId], references: [orders.id] }),
}));

export const userDiscordLinksRelations = relations(userDiscordLinks, ({ one }) => ({
  user: one(users, { fields: [userDiscordLinks.userId], references: [users.id] }),
}));

export const discordRoleMappingsRelations = relations(discordRoleMappings, ({ one }) => ({
  plan: one(plans, { fields: [discordRoleMappings.planId], references: [plans.id] }),
}));

// ─── Inferred types ───

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type Plan = typeof plans.$inferSelect;
export type UserPurchase = typeof userPurchases.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type UserProgress = typeof userProgress.$inferSelect;
export type ServiceConfig = typeof serviceConfigs.$inferSelect;
export type WebhookLog = typeof webhookLogs.$inferSelect;
export type EntitlementOutboxEvent = typeof entitlementOutbox.$inferSelect;
export type PlanContent = typeof planContents.$inferSelect;
export type PlanPresentation = typeof planPresentations.$inferSelect;
export type NewPlanPresentation = typeof planPresentations.$inferInsert;
export type Media = typeof media.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type ContentRevision = typeof contentRevisions.$inferSelect;
export type AgentApiKey = typeof agentApiKeys.$inferSelect;
export type UserApiToken = typeof userApiTokens.$inferSelect;
export type LibraryEntry = typeof libraryEntries.$inferSelect;
export type NewLibraryEntry = typeof libraryEntries.$inferInsert;
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type SkillRelease = typeof skillReleases.$inferSelect;
export type NewSkillRelease = typeof skillReleases.$inferInsert;
export type AgentInformationItem = typeof agentInformationItems.$inferSelect;
export type NewAgentInformationItem = typeof agentInformationItems.$inferInsert;
export type AgentInformationEvent = typeof agentInformationEvents.$inferSelect;
export type UserAgentInformationRead = typeof userAgentInformationReads.$inferSelect;
export type PortalyProductMapping = typeof portalyProductMappings.$inferSelect;
export type PortalyMarketplaceEvent = typeof portalyMarketplaceEvents.$inferSelect;
export type UserDiscordLink = typeof userDiscordLinks.$inferSelect;
export type DiscordRoleMapping = typeof discordRoleMappings.$inferSelect;
export type EventsRaw = typeof eventsRaw.$inferSelect;
export type PlanCourse = typeof planCourses.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type NewJobRun = typeof jobRuns.$inferInsert;
