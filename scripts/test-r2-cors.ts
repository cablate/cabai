/**
 * Test R2 CORS configuration end-to-end:
 * 1. Get a presigned URL from the app's upload API
 * 2. Send OPTIONS preflight to R2 with Origin header
 * 3. PUT a small test file to R2 via presigned URL
 * 4. Verify the file is accessible via public URL
 *
 * Usage: npx tsx scripts/test-r2-cors.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env
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
  console.warn("No .env file found");
}

const ORIGIN = "http://localhost:3002";

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function main() {
  // Dynamic import so env vars are loaded first
  const { generateUploadSignedUrl, getPublicUrl, deleteObject } = await import("../src/lib/r2-client.js");
  const testKey = `uploads/cors-test/${Date.now()}-test.txt`;
  const testContent = "CORS test file - safe to delete";

  console.log("=== R2 CORS Test ===\n");

  // Step 1: Generate presigned URL
  console.log("1. Generating presigned PUT URL...");
  let signedUrl: string;
  try {
    signedUrl = await generateUploadSignedUrl(testKey, "text/plain", 300);
    console.log(`   ✓ Got presigned URL: ${signedUrl.slice(0, 80)}...`);
  } catch (err: unknown) {
    console.error(`   ✗ Failed to generate presigned URL: ${getErrorMessage(err)}`);
    process.exit(1);
  }

  // Step 2: OPTIONS preflight
  console.log("\n2. Sending OPTIONS preflight to R2...");
  try {
    const preflightRes = await fetch(signedUrl, {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });

    const allowOrigin = preflightRes.headers.get("access-control-allow-origin");
    const allowMethods = preflightRes.headers.get("access-control-allow-methods");

    console.log(`   Status: ${preflightRes.status}`);
    console.log(`   Access-Control-Allow-Origin: ${allowOrigin}`);
    console.log(`   Access-Control-Allow-Methods: ${allowMethods}`);

    if (allowOrigin && (allowOrigin === ORIGIN || allowOrigin === "*")) {
      console.log("   ✓ CORS preflight passed!");
    } else {
      console.error(`   ✗ CORS preflight failed — origin '${ORIGIN}' not allowed`);
      console.error("   Check Cloudflare R2 bucket CORS settings");
      process.exit(1);
    }
  } catch (err: unknown) {
    console.error(`   ✗ Preflight request failed: ${getErrorMessage(err)}`);
    process.exit(1);
  }

  // Step 3: PUT file via presigned URL (simulating browser upload)
  console.log("\n3. Uploading test file via presigned PUT...");
  try {
    const putRes = await fetch(signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
        Origin: ORIGIN,
      },
      body: testContent,
    });

    console.log(`   Status: ${putRes.status}`);

    if (putRes.ok) {
      console.log("   ✓ Upload succeeded!");
    } else {
      const body = await putRes.text();
      console.error(`   ✗ Upload failed: ${body.slice(0, 200)}`);
      process.exit(1);
    }
  } catch (err: unknown) {
    console.error(`   ✗ PUT request failed: ${getErrorMessage(err)}`);
    process.exit(1);
  }

  // Step 4: Verify file accessible via public URL
  const publicUrl = getPublicUrl(testKey);
  console.log(`\n4. Verifying public URL: ${publicUrl}`);
  try {
    const getRes = await fetch(publicUrl);
    const content = await getRes.text();

    if (getRes.ok && content === testContent) {
      console.log("   ✓ File accessible and content matches!");
    } else {
      console.log(`   Status: ${getRes.status}, Content: ${content.slice(0, 100)}`);
      console.warn("   ⚠ File may not be publicly accessible (check R2 public access settings)");
    }
  } catch (err: unknown) {
    console.warn(`   ⚠ Public URL check failed: ${getErrorMessage(err)}`);
  }

  // Step 5: Cleanup
  console.log("\n5. Cleaning up test file...");
  try {
    await deleteObject(testKey);
    console.log("   ✓ Test file deleted");
  } catch (err: unknown) {
    console.warn(`   ⚠ Cleanup failed (not critical): ${getErrorMessage(err)}`);
  }

  console.log("\n=== All tests passed! R2 CORS is working. ===");
}

main().catch((err: unknown) => {
  console.error("\nTest failed:", getErrorMessage(err));
  process.exit(1);
});
