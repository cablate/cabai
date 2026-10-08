import { NextResponse } from "next/server";

/**
 * Legacy Marketplace ingress is unavailable in the first public release.
 * Its data-only MAC does not authenticate event or timestamp. Freshness and
 * prior-paid checks cannot prevent relabeling a captured signed data envelope.
 * Do not restore processing until an authenticated event/provider reconciliation
 * contract and adversarial route tests exist. Standard /api/callback is separate.
 * Keep stored records and admin reconciliation tools intact; never acknowledge
 * an event as accepted when it has not been safely persisted.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Legacy Marketplace webhook is unavailable; contact the site operator." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
