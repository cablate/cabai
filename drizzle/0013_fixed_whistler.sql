CREATE TABLE "entitlement_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"order_id" text,
	"purchase_id" text,
	"source" text NOT NULL,
	"triggered_by" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"webhook_enqueued_at" timestamp with time zone,
	"discord_synced_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_reservation_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entitlement_outbox" ADD CONSTRAINT "entitlement_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_outbox" ADD CONSTRAINT "entitlement_outbox_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_outbox" ADD CONSTRAINT "entitlement_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_outbox" ADD CONSTRAINT "entitlement_outbox_purchase_id_user_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."user_purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_entitlement_outbox_status_retry" ON "entitlement_outbox" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_entitlement_outbox_lock" ON "entitlement_outbox" USING btree ("status","locked_at");--> statement-breakpoint
CREATE INDEX "idx_entitlement_outbox_user_plan" ON "entitlement_outbox" USING btree ("user_id","plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_orders_one_pending_checkout" ON "orders" USING btree ("user_id","plan_id") WHERE status = 'pending';