ALTER TABLE "provider_sync_jobs" ADD COLUMN "provider_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "provider_sync_jobs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_sync_jobs" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "provider_sync_jobs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_sync_jobs" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_sync_jobs" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_provider_sync_jobs_queue" ON "provider_sync_jobs" USING btree ("status","next_attempt_at","started_at");--> statement-breakpoint
CREATE INDEX "idx_provider_sync_jobs_lease" ON "provider_sync_jobs" USING btree ("status","lease_expires_at");