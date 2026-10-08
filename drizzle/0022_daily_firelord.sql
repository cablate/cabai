ALTER TABLE "orders" ADD COLUMN "provider_mode" text;--> statement-breakpoint
UPDATE "orders"
SET "provider_mode" = "callback_payload"->>'mode'
WHERE "provider_mode" IS NULL
  AND "callback_payload"->>'mode' IN ('test', 'live');
