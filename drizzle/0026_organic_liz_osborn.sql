ALTER TABLE "provider_sync_jobs" ADD COLUMN "recovery_key_hash" text;--> statement-breakpoint
ALTER TABLE "provider_sync_jobs" ADD COLUMN "result" jsonb;