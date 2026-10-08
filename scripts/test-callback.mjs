#!/usr/bin/env node
/**
 * Simulates a Portaly callback to test signature verification locally.
 *
 * Usage:
 *   node scripts/test-callback.mjs [callbackUrl]
 *
 * Defaults to http://localhost:3000/api/callback
 * Reads PORTALY_MODE, PORTALY_TEST_CALLBACK_SECRET, PORTALY_LIVE_CALLBACK_SECRET from .env
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";

// ─── Load .env ───
const envPath = new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const envText = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k, v]) => k && v),
);

const mode = env.PORTALY_MODE || "test";
const secret =
  mode === "test"
    ? env.PORTALY_TEST_CALLBACK_SECRET
    : env.PORTALY_LIVE_CALLBACK_SECRET;

if (!secret) {
  console.error(`Missing PORTALY_${mode.toUpperCase()}_CALLBACK_SECRET in .env`);
  process.exit(1);
}

const callbackUrl = process.argv[2] || "http://localhost:3000/api/callback";

// ─── Stable JSON ───
function stableJson(value) {
  if (Array.isArray(value))
    return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

// ─── Build payload ───
const timestamp = new Date().toISOString();
const payload = {
  event: "creator_subscription.checkout.completed",
  sessionId: `test_session_${Date.now()}`,
  subscriptionId: `test_session_${Date.now()}`,
  profileId: env.PORTALY_PROFILE_ID || "test_profile",
  planId: "test_plan",
  mode,
  status: "completed",
  merchantOrderNumber: `ORD-TEST-${Date.now().toString(36).toUpperCase()}`,
  amount: 100,
  currency: "TWD",
  customerEmail: "test@example.com",
  customerName: "Test User",
  completedAt: timestamp,
  paymentReference: `txn_test_${Date.now()}`,
  paymentMethod: "tappay",
};

const sig = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}.${stableJson(payload)}`)
  .digest("hex");

console.log("Mode:", mode);
console.log("Callback URL:", callbackUrl);
console.log("Timestamp:", timestamp);
console.log("Signature:", sig);
console.log("Payload:", JSON.stringify(payload, null, 2));
console.log("---");

const res = await fetch(callbackUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-portaly-event": "creator_subscription.checkout.completed",
    "x-portaly-timestamp": timestamp,
    "x-portaly-signature": sig,
  },
  body: JSON.stringify(payload),
});

console.log("Status:", res.status);
const body = await res.text();
console.log("Response:", body);
