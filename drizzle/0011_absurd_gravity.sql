CREATE TABLE IF NOT EXISTS "site_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "expected_amount" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "expected_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "provider_plan_id" text;--> statement-breakpoint
UPDATE "plans"
SET "provider_plan_id" = "id"
WHERE "gateway" = 'portaly'
  AND "provider_plan_id" IS NULL;--> statement-breakpoint
UPDATE "orders"
SET
  "expected_amount" = "plans"."amount",
  "expected_currency" = "orders"."currency"
FROM "plans"
WHERE "orders"."plan_id" = "plans"."id"
  AND "orders"."expected_amount" IS NULL;
