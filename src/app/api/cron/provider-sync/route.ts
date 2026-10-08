import { NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-route";
import { runJob } from "@/lib/jobs/runner";

const logger = createLogger("cron-provider-sync");

export const POST = withApiHandler(
  { logger, operation: "provider sync runner", internalError: "Provider sync runner failed" },
  async (request) => {
    const reject = assertCronAuth(request);
    if (reject) return reject;

    const limitParam = new URL(request.url).searchParams.get("limit");
    const limit = limitParam === null ? 1 : Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
      return NextResponse.json({ error: "limit must be an integer between 1 and 10" }, { status: 400 });
    }

    try {
      const run = await runJob("provider-sync", { limit }, {
        trigger: "external_cron",
        triggerId: "cron.provider-sync",
      });
      return NextResponse.json({ executed: run.executed, ...(run.result as object | undefined) });
    } catch (error) {
      logger.error("Provider sync runner failed", { error: error instanceof Error ? error.message : String(error) });
      return NextResponse.json({ error: "Provider sync runner failed" }, { status: 500 });
    }
  },
);
