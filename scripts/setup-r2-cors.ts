/**
 * Set CORS policy on the R2 bucket so browsers can PUT files
 * via presigned URLs.
 *
 * Usage: npx tsx scripts/setup-r2-cors.ts
 *
 * Requires env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID,
 * CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME
 */

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually (no dotenv dependency)
const envPath = resolve(import.meta.dirname ?? __dirname, "../.env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.warn("No .env file found, using existing env vars");
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.error("Missing required R2 env vars. Check .env");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3002",
  ...(appUrl.startsWith("http://localhost") ? [] : [appUrl]),
];

async function main() {
  console.log(`Setting CORS on bucket: ${bucketName}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedOrigins,
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["Content-Type", "x-amz-content-sha256"],
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );

  console.log("CORS policy set. Verifying...");

  const result = await client.send(
    new GetBucketCorsCommand({ Bucket: bucketName })
  );

  console.log("Current CORS rules:");
  console.log(JSON.stringify(result.CORSRules, null, 2));
  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed to set CORS:", err.message);
  process.exit(1);
});
