CREATE TABLE "agent_information_events" (
	"id" text PRIMARY KEY NOT NULL,
	"information_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_agent_information_events_from_status" CHECK ("agent_information_events"."from_status" IS NULL OR "agent_information_events"."from_status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "chk_agent_information_events_to_status" CHECK ("agent_information_events"."to_status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "chk_agent_information_events_actor_type" CHECK ("agent_information_events"."actor_type" IN ('user', 'agent', 'system')),
	CONSTRAINT "chk_agent_information_events_transition" CHECK ("agent_information_events"."from_status" IS NULL OR "agent_information_events"."from_status" <> "agent_information_events"."to_status"),
	CONSTRAINT "chk_agent_information_events_revision_positive" CHECK ("agent_information_events"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "agent_information_items" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_version" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"why_it_matters" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT 'all_users' NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_agent_information_source_type" CHECK ("agent_information_items"."source_type" IN ('library_entry', 'skill_release', 'course', 'api_operation')),
	CONSTRAINT "chk_agent_information_audience" CHECK ("agent_information_items"."audience" IN ('all_users', 'source_entitled')),
	CONSTRAINT "chk_agent_information_status" CHECK ("agent_information_items"."status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "chk_agent_information_revision_positive" CHECK ("agent_information_items"."revision" >= 1),
	CONSTRAINT "chk_agent_information_lifecycle" CHECK ((
      ("agent_information_items"."status" = 'draft' AND "agent_information_items"."published_at" IS NULL AND "agent_information_items"."withdrawn_at" IS NULL)
      OR ("agent_information_items"."status" = 'published' AND "agent_information_items"."published_at" IS NOT NULL AND "agent_information_items"."withdrawn_at" IS NULL)
      OR ("agent_information_items"."status" = 'withdrawn' AND "agent_information_items"."published_at" IS NOT NULL AND "agent_information_items"."withdrawn_at" IS NOT NULL)
    )),
	CONSTRAINT "chk_agent_information_expiry" CHECK ("agent_information_items"."expires_at" IS NULL OR "agent_information_items"."published_at" IS NULL OR "agent_information_items"."expires_at" > "agent_information_items"."published_at")
);
--> statement-breakpoint
CREATE TABLE "library_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body_markdown" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_library_entries_status" CHECK ("library_entries"."status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "chk_library_entries_revision_positive" CHECK ("library_entries"."revision" >= 1),
	CONSTRAINT "chk_library_entries_lifecycle" CHECK ((
      ("library_entries"."status" = 'draft' AND "library_entries"."published_at" IS NULL AND "library_entries"."withdrawn_at" IS NULL)
      OR ("library_entries"."status" = 'published' AND "library_entries"."published_at" IS NOT NULL AND "library_entries"."withdrawn_at" IS NULL)
      OR ("library_entries"."status" = 'withdrawn' AND "library_entries"."published_at" IS NOT NULL AND "library_entries"."withdrawn_at" IS NOT NULL)
    ))
);
--> statement-breakpoint
CREATE TABLE "skill_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"version" text NOT NULL,
	"artifact_media_id" text,
	"checksum_sha256" text,
	"compatibility" text DEFAULT '' NOT NULL,
	"license" text DEFAULT '' NOT NULL,
	"changelog_markdown" text DEFAULT '' NOT NULL,
	"access_policy" text DEFAULT 'authenticated' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"deprecated_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_skill_releases_access_policy" CHECK ("skill_releases"."access_policy" IN ('public', 'authenticated')),
	CONSTRAINT "chk_skill_releases_status" CHECK ("skill_releases"."status" IN ('draft', 'published', 'deprecated', 'withdrawn')),
	CONSTRAINT "chk_skill_releases_revision_positive" CHECK ("skill_releases"."revision" >= 1),
	CONSTRAINT "chk_skill_releases_checksum" CHECK ("skill_releases"."checksum_sha256" IS NULL OR "skill_releases"."checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "chk_skill_releases_published_artifact" CHECK ("skill_releases"."status" = 'draft' OR ("skill_releases"."artifact_media_id" IS NOT NULL AND "skill_releases"."checksum_sha256" IS NOT NULL)),
	CONSTRAINT "chk_skill_releases_lifecycle" CHECK ((
      ("skill_releases"."status" = 'draft' AND "skill_releases"."published_at" IS NULL AND "skill_releases"."deprecated_at" IS NULL AND "skill_releases"."withdrawn_at" IS NULL)
      OR ("skill_releases"."status" = 'published' AND "skill_releases"."published_at" IS NOT NULL AND "skill_releases"."deprecated_at" IS NULL AND "skill_releases"."withdrawn_at" IS NULL)
      OR ("skill_releases"."status" = 'deprecated' AND "skill_releases"."published_at" IS NOT NULL AND "skill_releases"."deprecated_at" IS NOT NULL AND "skill_releases"."withdrawn_at" IS NULL)
      OR ("skill_releases"."status" = 'withdrawn' AND "skill_releases"."published_at" IS NOT NULL AND "skill_releases"."withdrawn_at" IS NOT NULL)
    ))
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_release_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_skills_status" CHECK ("skills"."status" IN ('draft', 'published', 'withdrawn')),
	CONSTRAINT "chk_skills_revision_positive" CHECK ("skills"."revision" >= 1),
	CONSTRAINT "chk_skills_lifecycle" CHECK ((
      ("skills"."status" = 'draft' AND "skills"."published_at" IS NULL AND "skills"."withdrawn_at" IS NULL AND "skills"."current_release_id" IS NULL)
      OR ("skills"."status" = 'published' AND "skills"."published_at" IS NOT NULL AND "skills"."withdrawn_at" IS NULL AND "skills"."current_release_id" IS NOT NULL)
      OR ("skills"."status" = 'withdrawn' AND "skills"."published_at" IS NOT NULL AND "skills"."withdrawn_at" IS NOT NULL)
    ))
);
--> statement-breakpoint
CREATE TABLE "user_agent_information_reads" (
	"user_id" text NOT NULL,
	"information_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_user_agent_information_reads" PRIMARY KEY("user_id","information_id")
);
--> statement-breakpoint
ALTER TABLE "user_api_tokens" ALTER COLUMN "scopes" SET DEFAULT '{course:read,skill:read,information:read,information:ack}';--> statement-breakpoint
ALTER TABLE "agent_information_events" ADD CONSTRAINT "agent_information_events_information_id_agent_information_items_id_fk" FOREIGN KEY ("information_id") REFERENCES "public"."agent_information_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_releases" ADD CONSTRAINT "skill_releases_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_releases" ADD CONSTRAINT "skill_releases_artifact_media_id_media_id_fk" FOREIGN KEY ("artifact_media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_information_reads" ADD CONSTRAINT "user_agent_information_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agent_information_reads" ADD CONSTRAINT "user_agent_information_reads_information_id_agent_information_items_id_fk" FOREIGN KEY ("information_id") REFERENCES "public"."agent_information_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_information_events_idempotency_unique" ON "agent_information_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_agent_information_events_history" ON "agent_information_events" USING btree ("information_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_information_dedupe_unique" ON "agent_information_items" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_agent_information_source" ON "agent_information_items" USING btree ("source_type","source_id","source_version");--> statement-breakpoint
CREATE INDEX "idx_agent_information_unread_feed" ON "agent_information_items" USING btree ("status","audience","published_at","id");--> statement-breakpoint
CREATE INDEX "idx_agent_information_kind" ON "agent_information_items" USING btree ("kind","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_library_entries_slug_unique" ON "library_entries" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_library_entries_published_feed" ON "library_entries" USING btree ("status","published_at","id");--> statement-breakpoint
CREATE INDEX "idx_library_entries_featured" ON "library_entries" USING btree ("featured","published_at") WHERE "library_entries"."status" = 'published';--> statement-breakpoint
CREATE INDEX "idx_library_entries_tags" ON "library_entries" USING gin ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_releases_skill_version_unique" ON "skill_releases" USING btree ("skill_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_releases_artifact_unique" ON "skill_releases" USING btree ("artifact_media_id") WHERE "skill_releases"."artifact_media_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_skill_releases_status" ON "skill_releases" USING btree ("skill_id","status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skills_slug_unique" ON "skills" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_skills_status" ON "skills" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "idx_skills_current_release" ON "skills" USING btree ("current_release_id");--> statement-breakpoint
CREATE INDEX "idx_user_agent_information_reads_information" ON "user_agent_information_reads" USING btree ("information_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_user_agent_information_reads_user_time" ON "user_agent_information_reads" USING btree ("user_id","read_at");