ALTER TABLE "plans" ADD COLUMN "slug" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_plans_slug_unique" ON "plans" USING btree ("slug") WHERE slug IS NOT NULL;