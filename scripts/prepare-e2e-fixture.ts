#!/usr/bin/env tsx

import { dbPool } from "@/lib/db";
import { cleanTestData } from "@/test/helpers";
import { requireTestDatabaseUrl } from "@/test/setup";
import { seedDemo } from "./seed-demo";

async function main() {
  requireTestDatabaseUrl();
  await cleanTestData();
  const result = await seedDemo();
  console.log(`[e2e] fixture ready: plan=${result.planId} course=${result.courseId}`);
}

main()
  .catch((error) => {
    console.error("[e2e] fixture preparation failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbPool.end();
  });
