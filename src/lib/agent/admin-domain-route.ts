import { ApiError, dataResponse } from "@/lib/api-route";
import {
  domainFailureHttpStatus,
  type DomainActor,
  type DomainResult,
} from "@/lib/services/library-skill-information-domain";

export interface AgentIdentity {
  agentId: string;
  name: string;
}

export function toDomainAgent(agent: AgentIdentity): DomainActor {
  return { type: "agent", id: agent.agentId, name: agent.name };
}

export function domainResultResponse<T>(
  result: DomainResult<T>,
  successStatus = 200,
): Response {
  if (result.ok) return dataResponse(result.value, successStatus);
  return Response.json({
    error: result.message,
    kind: result.kind,
    ...(result.retryable === undefined ? {} : { retryable: result.retryable }),
    ...(result.issues === undefined ? {} : { issues: result.issues }),
  }, { status: domainFailureHttpStatus[result.kind] });
}

export function requirePathIdentity(actual: string, expected: string, field: string): void {
  if (actual !== expected) {
    throw new ApiError({
      code: "PATH_BODY_MISMATCH",
      message: `${field} must match the path resource`,
      status: 409,
    });
  }
}
