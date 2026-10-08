CREATE TABLE "job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_key" text NOT NULL,
	"trigger" text NOT NULL,
	"trigger_id" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"safe_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"error_summary" text,
	"runner_id" text NOT NULL,
	"app_version" text DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_job_runs_job_started" ON "job_runs" USING btree ("job_key","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_job_runs_finished" ON "job_runs" USING btree ("finished_at") WHERE "job_runs"."finished_at" IS NOT NULL;