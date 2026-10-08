CREATE TABLE "events_raw" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_discord_links" ADD COLUMN "unlinked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events_raw" ADD CONSTRAINT "events_raw_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_events_user_type_time" ON "events_raw" USING btree ("user_id","event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_events_type_time" ON "events_raw" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_events_created_at" ON "events_raw" USING btree ("created_at");