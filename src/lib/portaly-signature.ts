import crypto from "node:crypto";
import { stableJson } from "@/lib/stable-json";
import { resolvePortalyConfig } from "@/lib/config/portaly";

const PORTALY_CONFIG = resolvePortalyConfig();
const PORTALY_CALLBACK_SECRET = PORTALY_CONFIG.state === "enabled"
  ? (PORTALY_CONFIG.callbackSecret ?? "")
  : "";

function signCallback(
  secret: string,
  payload: unknown,
  timestamp: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${stableJson(payload)}`)
    .digest("hex");
}

export function verifyCallback(
  payload: unknown,
  timestamp: string,
  signature: string,
): boolean {
  if (!PORTALY_CALLBACK_SECRET) return false;

  const ts = new Date(timestamp);
  const tsMs = ts.getTime();
  if (Number.isNaN(tsMs)) return false;

  const now = Date.now();
  if (Math.abs(now - tsMs) > 5 * 60 * 1000) return false;

  const expected = signCallback(PORTALY_CALLBACK_SECRET, payload, timestamp);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.byteLength !== b.byteLength) return false;

  return crypto.timingSafeEqual(a, b);
}
