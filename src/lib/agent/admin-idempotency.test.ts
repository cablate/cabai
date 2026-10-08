import { describe, expect, it, vi } from "vitest";
import {
  createWithIdempotency,
  deriveIdempotentResourceId,
  requireIdempotencyKey,
} from "./admin-idempotency";
import { domainFailure, domainSuccess } from "@/lib/services/library-skill-information-domain";

describe("Admin create idempotency", () => {
  it("derives a stable actor- and operation-bound opaque ID", () => {
    const input = { actorId: "agent-key:key-1", operationId: "createLibraryEntry", idempotencyKey: "retry-1" };
    const first = deriveIdempotentResourceId(input);
    expect(first).toMatch(/^idem_[0-9a-f]{48}$/);
    expect(deriveIdempotentResourceId(input)).toBe(first);
    expect(deriveIdempotentResourceId({ ...input, actorId: "agent-key:key-2" })).not.toBe(first);
    expect(deriveIdempotentResourceId({ ...input, operationId: "createSkill" })).not.toBe(first);
  });

  it("requires a bounded visible-ASCII header", () => {
    expect(requireIdempotencyKey(new Request("https://example.test", {
      headers: { "Idempotency-Key": "create-001" },
    }))).toBe("create-001");
    expect(() => requireIdempotencyKey(new Request("https://example.test"))).toThrowError(/Idempotency-Key/);
    expect(() => requireIdempotencyKey(new Request("https://example.test", {
      headers: { "Idempotency-Key": "contains space" },
    }))).toThrowError(/visible ASCII/);
  });

  it("replays an equal resource without creating again", async () => {
    const create = vi.fn();
    const result = await createWithIdempotency<{ id: string; title: string }>({
      load: async () => domainSuccess({ id: "idem_1", title: "Same" }),
      create,
      matches: (resource) => resource.title === "Same",
    });
    expect(result).toEqual(domainSuccess({ resource: { id: "idem_1", title: "Same" }, replayed: true }));
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects reuse with a different payload", async () => {
    const result = await createWithIdempotency({
      load: async () => domainSuccess({ id: "idem_1", title: "Old" }),
      create: async () => domainFailure("conflict", "not called"),
      matches: (resource) => resource.title === "New",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("conflict");
  });

  it("recovers a concurrent create replay", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(domainFailure("not-found", "missing"))
      .mockResolvedValueOnce(domainSuccess({ id: "idem_1", title: "Same" }));
    const result = await createWithIdempotency<{ id: string; title: string }>({
      load,
      create: async () => domainFailure("conflict", "unique violation"),
      matches: (resource) => resource.title === "Same",
    });
    expect(result).toEqual(domainSuccess({ resource: { id: "idem_1", title: "Same" }, replayed: true }));
  });
});
