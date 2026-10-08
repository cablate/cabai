ALTER TABLE "plans" ADD COLUMN "purchase_button_mode" text DEFAULT 'internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "external_checkout_url" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "external_checkout_label" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "external_checkout_new_tab" boolean DEFAULT true NOT NULL;
