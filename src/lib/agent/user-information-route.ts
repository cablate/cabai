import { domainResultResponse } from "@/lib/agent/admin-domain-route";
import type { DomainResult } from "@/lib/services/library-skill-information-domain";

/**
 * The public/user read-plane contract treats malformed cursors and request
 * inputs as HTTP 400. Other domain failures retain the canonical mapping.
 */
export function userInformationResultResponse<T>(result: DomainResult<T>): Response {
  if (!result.ok && result.kind === "validation-failed") {
    return Response.json({
      error: result.message,
      kind: result.kind,
      ...(result.retryable === undefined ? {} : { retryable: result.retryable }),
      ...(result.issues === undefined ? {} : { issues: result.issues }),
    }, { status: 400 });
  }

  return domainResultResponse(result);
}
