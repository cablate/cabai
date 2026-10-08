CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "agent_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"permissions" text[] DEFAULT '{read}' NOT NULL,
	"created_by" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"changed_by" text NOT NULL,
	"change_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"course_status" text DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_role_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"role_id" text NOT NULL,
	"role_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"course_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"duration" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_preview" boolean DEFAULT false NOT NULL,
	"lesson_status" text DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"public_url" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"context" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"media_status" text DEFAULT 'pending' NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "operation_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"tables_data" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"merchant_order_number" text NOT NULL,
	"portaly_session_id" text,
	"subscription_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"currency" varchar(3) DEFAULT 'TWD' NOT NULL,
	"paid_amount" integer,
	"payment_method" text,
	"callback_payload" jsonb,
	"refund_amount" integer,
	"refunded_at" timestamp with time zone,
	"refund_reason" text,
	"checkout_url" text,
	"subscription_status" text,
	"cancel_at_period_end" boolean,
	"cancel_effective_at" timestamp with time zone,
	"next_billing_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_merchant_order_number_unique" UNIQUE("merchant_order_number"),
	CONSTRAINT "orders_portaly_session_id_unique" UNIQUE("portaly_session_id")
);
--> statement-breakpoint
CREATE TABLE "plan_contents" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_courses" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"course_id" text NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_presentations" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"offering_type" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"cover_image" text,
	"banner_image" text,
	"cta_label" text,
	"metadata_json" jsonb,
	"trust_notes_json" jsonb,
	"is_featured" boolean DEFAULT false NOT NULL,
	"featured_sort_order" integer,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_presentations_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'TWD' NOT NULL,
	"billing_period" text NOT NULL,
	"pricing_type" text,
	"status" text DEFAULT 'active' NOT NULL,
	"image" text,
	"merchant_plan_id" text,
	"has_platform_content" boolean DEFAULT false NOT NULL,
	"has_external_service" boolean DEFAULT false NOT NULL,
	"gateway" text DEFAULT 'portaly' NOT NULL,
	"portaly_created_at" text,
	"portaly_updated_at" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portaly_marketplace_events" (
	"id" text PRIMARY KEY NOT NULL,
	"portaly_order_id" text NOT NULL,
	"portaly_product_id" text NOT NULL,
	"event" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'TWD' NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"fee_amount" integer DEFAULT 0 NOT NULL,
	"net_total" integer DEFAULT 0 NOT NULL,
	"payment_method" text,
	"coupon_code" text,
	"raw_payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"matched_user_id" text,
	"matched_plan_id" text,
	"created_order_id" text,
	"processed_at" timestamp with time zone,
	"error" text,
	"portaly_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portaly_product_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"portaly_product_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"product_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portaly_product_mappings_portaly_product_id_unique" UNIQUE("portaly_product_id")
);
--> statement-breakpoint
CREATE TABLE "service_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"service_name" text NOT NULL,
	"webhook_url" text NOT NULL,
	"api_key_prefix" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"identity_field" text DEFAULT 'email' NOT NULL,
	"config_json" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_discord_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"discord_id" text NOT NULL,
	"discord_username" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_discord_links_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_discord_links_discord_id_unique" UNIQUE("discord_id")
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"order_id" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by" text DEFAULT 'payment' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "webhook_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"service_config_id" text NOT NULL,
	"order_id" text,
	"user_id" text,
	"event_type" text NOT NULL,
	"payload_json" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"http_status" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_logs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_api_keys" ADD CONSTRAINT "agent_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_role_mappings" ADD CONSTRAINT "discord_role_mappings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_contents" ADD CONSTRAINT "plan_contents_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_presentations" ADD CONSTRAINT "plan_presentations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portaly_marketplace_events" ADD CONSTRAINT "portaly_marketplace_events_matched_user_id_users_id_fk" FOREIGN KEY ("matched_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portaly_marketplace_events" ADD CONSTRAINT "portaly_marketplace_events_matched_plan_id_plans_id_fk" FOREIGN KEY ("matched_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portaly_marketplace_events" ADD CONSTRAINT "portaly_marketplace_events_created_order_id_orders_id_fk" FOREIGN KEY ("created_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portaly_product_mappings" ADD CONSTRAINT "portaly_product_mappings_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_configs" ADD CONSTRAINT "service_configs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_discord_links" ADD CONSTRAINT "user_discord_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_purchases" ADD CONSTRAINT "user_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_purchases" ADD CONSTRAINT "user_purchases_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_purchases" ADD CONSTRAINT "user_purchases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_content_revisions_entity_version" ON "content_revisions" USING btree ("entity_type","entity_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_discord_role_mappings_plan_role" ON "discord_role_mappings" USING btree ("plan_id","role_id");--> statement-breakpoint
CREATE INDEX "idx_media_status" ON "media" USING btree ("media_status");--> statement-breakpoint
CREATE INDEX "idx_media_entity" ON "media" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_media_uploader" ON "media" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "idx_orders_user_id" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_plan_id" ON "orders" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_orders_user_plan_status" ON "orders" USING btree ("user_id","plan_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plan_courses_plan_course" ON "plan_courses" USING btree ("plan_id","course_id");--> statement-breakpoint
CREATE INDEX "idx_plan_presentations_featured" ON "plan_presentations" USING btree ("is_featured","featured_sort_order");--> statement-breakpoint
CREATE INDEX "idx_plan_presentations_type" ON "plan_presentations" USING btree ("offering_type");--> statement-breakpoint
CREATE INDEX "idx_plan_presentations_published" ON "plan_presentations" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_mkt_events_order_event" ON "portaly_marketplace_events" USING btree ("portaly_order_id","event");--> statement-breakpoint
CREATE INDEX "idx_mkt_events_status" ON "portaly_marketplace_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mkt_events_product" ON "portaly_marketplace_events" USING btree ("portaly_product_id");--> statement-breakpoint
CREATE INDEX "idx_mkt_events_email" ON "portaly_marketplace_events" USING btree ("customer_email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_service_configs_plan_service" ON "service_configs" USING btree ("plan_id","service_name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_progress_unique" ON "user_progress" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_purchases_unique" ON "user_purchases" USING btree ("user_id","plan_id","order_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_logs_status_retry" ON "webhook_logs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_webhook_logs_lock" ON "webhook_logs" USING btree ("status","locked_at");