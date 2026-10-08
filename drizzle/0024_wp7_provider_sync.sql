CREATE TABLE "provider_sync_change_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"actor_id" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"fingerprint" text NOT NULL,
	"changes" jsonb NOT NULL,
	"counts" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_sync_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"actor_id" text NOT NULL,
	"idempotency_key_hash" text NOT NULL,
	"change_set_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"synced" integer,
	"audit_id" text,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_provider_sync_change_sets_actor_created" ON "provider_sync_change_sets" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_provider_sync_change_sets_expires" ON "provider_sync_change_sets" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_provider_sync_jobs_idempotency" ON "provider_sync_jobs" USING btree ("operation","actor_id","idempotency_key_hash");--> statement-breakpoint
CREATE INDEX "idx_provider_sync_jobs_actor_started" ON "provider_sync_jobs" USING btree ("actor_id","started_at");