/**
 * Deterministic JSON serialisation with lexicographically sorted object keys.
 *
 * This is the canonical pre-image for HMAC signing/verification of BOTH:
 *   - inbound Portaly callbacks      (`portaly-signature.ts`)
 *   - outbound Entitlement Hub webhooks (`webhook-verify.ts`)
 *
 * Signer and verifier must agree byte-for-byte, so the algorithm lives in ONE
 * place. It previously existed as two hand-copied duplicates; a one-sided edit
 * to either copy would have silently broken signature verification. Do not
 * change the serialisation contract below without rotating every signing peer.
 *
 * Contract:
 *   - object keys sorted by `localeCompare`
 *   - array order preserved
 *   - scalars via `JSON.stringify`
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
