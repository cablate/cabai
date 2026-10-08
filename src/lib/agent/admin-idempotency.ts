import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api-route";
import {
  domainFailure,
  domainSuccess,
  type DomainResult,
} from "@/lib/services/library-skill-information-domain";

const IDEMPOTENCY_KEY_PATTERN = /^[!-~]{1,200}$/;

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ApiError({
      code: "INVALID_IDEMPOTENCY_KEY",
      message: "Idempotency-Key must contain 1 to 200 visible ASCII characters",
      status: 400,
    });
  }
  return key;
}

export function deriveIdempotentResourceId(input: {
  actorId: string;
  operationId: string;
  idempotencyKey: string;
}): string {
  const digest = createHash("sha256")
    .update(input.actorId)
    .update("\0")
    .update(input.operationId)
    .update("\0")
    .update(input.idempotencyKey)
    .digest("hex");
  return `idem_${digest.slice(0, 48)}`;
}

export async function createWithIdempotency<T>(input: {
  load: () => Promise<DomainResult<T>>;
  create: () => Promise<DomainResult<T>>;
  matches: (resource: T) => boolean;
}): Promise<DomainResult<{ resource: T; replayed: boolean }>> {
  const existing = await input.load();
  if (existing.ok) {
    return input.matches(existing.value)
      ? domainSuccess({ resource: existing.value, replayed: true })
      : domainFailure("conflict", "Idempotency key was already used with a different payload");
  }
  if (existing.kind !== "not-found") return existing;

  const created = await input.create();
  if (created.ok) return domainSuccess({ resource: created.value, replayed: false });
  if (created.kind !== "conflict") return created;

  const concurrent = await input.load();
  if (concurrent.ok) {
    return input.matches(concurrent.value)
      ? domainSuccess({ resource: concurrent.value, replayed: true })
      : domainFailure("conflict", "Idempotency key was already used with a different payload");
  }
  return created;
}

export function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
