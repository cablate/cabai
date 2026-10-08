ALTER TABLE "orders" ADD COLUMN "provider_plan_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_session_expires_at" timestamp with time zone;--> statement-breakpoint
UPDATE "orders" AS "order"
SET "provider_plan_id" = COALESCE("plan"."provider_plan_id", "plan"."id")
FROM "plans" AS "plan"
WHERE "order"."plan_id" = "plan"."id"
  AND "order"."provider_plan_id" IS NULL;
