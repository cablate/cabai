import { describe, expect, it } from "vitest";
import {
  assertWp10CanaryStorageKey,
  assertWp10OperatorPreflight,
  createWp10RolloutReceiptSkeleton,
  parseWp10RolloutReceipt,
  redactWp10Value,
  resumeWp10RolloutReceipt,
  wp10MutationConfirmation,
} from "./wp10-rollout-receipt";

const releaseId = "release-2026-07-17";
const storageKey = `wp10-canary/${releaseId}/skill.zip`;

describe("WP-10 rollout receipt schema", () => {
  it("accepts the machine-readable skeleton and rejects unknown fields at every level", () => {
    const receipt = createWp10RolloutReceiptSkeleton({
      releaseId,
      now: new Date("2026-07-17T01:02:03.000Z"),
    });

    expect(parseWp10RolloutReceipt(receipt)).toEqual(receipt);
    expect(() => parseWp10RolloutReceipt({ ...receipt, unexpected: true })).toThrow();
    expect(() => parseWp10RolloutReceipt({
      ...receipt,
      artifact: { ...receipt.artifact, signedUrl: "https://example.test/private?token=secret" },
    })).toThrow();
  });

  it("resumes validated evidence without claiming a side effect", () => {
    const receipt = createWp10RolloutReceiptSkeleton({
      releaseId,
      now: new Date("2026-07-17T01:00:00.000Z"),
    });
    receipt.migration = {
      status: "verified",
      expected: ["0015_skill_information"],
      applied: ["0015_skill_information"],
      evidence: ["readback https://r2.example.test/object?X-Amz-Signature=private"],
    };

    const resumed = resumeWp10RolloutReceipt(receipt, new Date("2026-07-17T02:00:00.000Z"));

    expect(resumed.migration.status).toBe("verified");
    expect(resumed.migration.evidence[0]).toContain("?redacted-signed-query");
    expect(resumed.resume).toEqual({ count: 1, sourceGeneratedAt: "2026-07-17T01:00:00.000Z" });
    expect(resumed.generatedAt).toBe("2026-07-17T02:00:00.000Z");
    expect(resumed.sideEffectsPerformed).toBe(false);
  });
});

describe("WP-10 operator mutation guard", () => {
  it("defaults to baseline-readback and never enables mutation", () => {
    expect(assertWp10OperatorPreflight({ releaseId })).toEqual({
      mode: "baseline-readback",
      releaseId,
      storageKey: null,
      mutationAllowed: false,
    });
  });

  it.each([
    ["allow flag", { allowMutation: "false", environment: "production", storageKey }],
    ["production environment", { allowMutation: "true", environment: "staging", storageKey }],
    ["release id", { allowMutation: "true", environment: "production", storageKey, releaseId: "../bad" }],
    ["storage key", { allowMutation: "true", environment: "production" }],
    ["exact confirmation", { allowMutation: "true", environment: "production", storageKey, confirmation: "yes" }],
  ])("fails before mutation when %s is invalid", (_label, overrides) => {
    expect(() => assertWp10OperatorPreflight({
      mode: "mutation",
      releaseId,
      confirmation: wp10MutationConfirmation(releaseId, storageKey),
      ...overrides,
    })).toThrow();
  });

  it("allows mutation only when every independent gate matches", () => {
    expect(assertWp10OperatorPreflight({
      mode: "mutation",
      allowMutation: "true",
      environment: "production",
      releaseId,
      storageKey,
      confirmation: wp10MutationConfirmation(releaseId, storageKey),
    }).mutationAllowed).toBe(true);
  });
});

describe("WP-10 canary prefix and redaction", () => {
  it.each([
    "uploads/skill-artifact/release/skill.zip",
    `wp10-canary/another-release/skill.zip`,
    `wp10-canary/${releaseId}/../escape.zip`,
    `wp10-canary/${releaseId}\\escape.zip`,
    `wp10-canary/${releaseId}/`,
  ])("rejects storage key outside the release canary prefix: %s", (value) => {
    expect(() => assertWp10CanaryStorageKey(value, releaseId)).toThrow();
  });

  it("redacts secret fields, bearer values, credentials, and signed URL query data", () => {
    const redacted = redactWp10Value({
      apiToken: "private-token",
      note: "Authorization=private Bearer abc.def",
      signedUrl: "https://user:password@r2.example.test/object?X-Amz-Credential=abc&X-Amz-Signature=private",
      nested: ["https://r2.example.test/object?token=private"],
    });
    const serialized = JSON.stringify(redacted);

    expect(redacted).toMatchObject({ apiToken: "[redacted]", signedUrl: "[redacted]" });
    expect(serialized).not.toMatch(/private-token|abc\.def|password@|X-Amz-Signature|token=private/);
    expect(serialized).toContain("redacted-signed-query");
  });
});
