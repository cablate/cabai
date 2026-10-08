ALTER TABLE "events_raw" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
UPDATE "events_raw" SET "occurred_at" = "created_at" WHERE "occurred_at" IS NULL;--> statement-breakpoint
ALTER TABLE "events_raw" ALTER COLUMN "occurred_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "events_raw" ALTER COLUMN "occurred_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events_raw" ADD COLUMN "source" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_events_source_type_occurred_at" ON "events_raw" USING btree ("source","event_type","occurred_at");
