import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-route";
import { assertCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";

const logger = createLogger("reliability-test");

export const dynamic = "force-dynamic";

export const GET = withApiHandler(
  {
    logger,
    operation: "run reliability error probe",
    includeErrorCode: true,
    internalError: "這是可靠性測試預期中的錯誤。",
  },
  async (request) => {
    if (process.env.RELIABILITY_TESTS_ENABLED !== "true") {
      return NextResponse.json({ error: "找不到這個資源。" }, { status: 404 });
    }
    const reject = assertCronAuth(request);
    if (reject) return reject;
    throw new Error("CABAI_RELIABILITY_TEST_API_ERROR");
  },
);
