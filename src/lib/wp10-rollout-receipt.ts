import { z } from "zod";

export const WP10_RECEIPT_VERSION = "wp10-rollout-receipt/v1" as const;
export const WP10_CANARY_ROOT = "wp10-canary" as const;

const releaseIdSchema = z.string().regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/,
  "releaseId must be a safe, non-empty release identifier.",
);
const timestampSchema = z.string().datetime();
const evidenceSchema = z.array(z.string().min(1).max(2_000)).max(100);

const decisionSchema = z.object({
  status: z.enum(["pending", "go", "abort", "rollback"]),
  reason: z.string().min(1).max(2_000).nullable(),
  decidedAt: timestampSchema.nullable(),
}).strict();

const migrationSchema = z.object({
  status: z.enum(["pending", "not-run", "verified", "failed"]),
  expected: z.array(z.string().min(1).max(160)).max(100),
  applied: z.array(z.string().min(1).max(160)).max(100),
  evidence: evidenceSchema,
}).strict();

const artifactSchema = z.object({
  status: z.enum(["pending", "not-run", "verified", "missing", "failed"]),
  storageKey: z.string().min(1).max(1_024).nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  byteLength: z.number().int().nonnegative().nullable(),
  readbackAt: timestampSchema.nullable(),
  evidence: evidenceSchema,
}).strict();

const canarySchema = z.object({
  status: z.enum(["pending", "not-run", "passed", "failed", "withdrawn"]),
  storageKey: z.string().min(1).max(1_024).nullable(),
  checks: z.array(z.string().min(1).max(200)).max(100),
  evidence: evidenceSchema,
}).strict();

const smokeCheckSchema = z.object({
  name: z.string().min(1).max(200),
  status: z.enum(["pending", "passed", "failed", "skipped"]),
  evidence: z.string().min(1).max(2_000).nullable(),
}).strict();

const smokeSchema = z.object({
  status: z.enum(["pending", "not-run", "passed", "failed"]),
  checks: z.array(smokeCheckSchema).max(100),
}).strict();

const rollbackSchema = z.object({
  status: z.enum(["pending", "ready", "not-required", "executed", "failed"]),
  strategy: z.string().min(1).max(2_000),
  executedAt: timestampSchema.nullable(),
  evidence: evidenceSchema,
}).strict();

const resumeSchema = z.object({
  count: z.number().int().nonnegative(),
  sourceGeneratedAt: timestampSchema.nullable(),
}).strict();

export const wp10RolloutReceiptSchema = z.object({
  receiptVersion: z.literal(WP10_RECEIPT_VERSION),
  releaseId: releaseIdSchema,
  environment: z.enum(["production", "staging", "local"]),
  mode: z.literal("baseline-readback"),
  generatedAt: timestampSchema,
  sideEffectsPerformed: z.literal(false),
  resume: resumeSchema,
  decision: decisionSchema,
  migration: migrationSchema,
  artifact: artifactSchema,
  canary: canarySchema,
  smoke: smokeSchema,
  rollback: rollbackSchema,
}).strict();

export type Wp10RolloutReceipt = z.infer<typeof wp10RolloutReceiptSchema>;
export type Wp10OperatorMode = "baseline-readback" | "mutation";

const SECRET_KEY_PATTERN = /(?:authorization|cookie|credential|password|passwd|secret|signature|signed.?url|token|api.?key)/i;
const SECRET_VALUE_PATTERN = /\b(authorization|password|passwd|secret|token|api[_-]?key|signature)\s*[:=]\s*([^\s,;]+)/gi;
const URL_PATTERN = /https?:\/\/[^\s<>'"`]+/gi;
const SIGNED_QUERY_PATTERN = /^(?:x-amz-|x-goog-|signature$|sig$|token$|credential$|expires$|policy$|key-pair-id$)/i;

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    const hasSignedQuery = [...url.searchParams.keys()].some((key) => SIGNED_QUERY_PATTERN.test(key));
    if (url.username || url.password) {
      url.username = "redacted";
      url.password = "";
    }
    if (hasSignedQuery) url.search = "?redacted-signed-query";
    url.hash = "";
    return url.toString();
  } catch {
    return "[redacted-url]";
  }
}

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(SECRET_VALUE_PATTERN, "$1=[redacted]")
    .replace(URL_PATTERN, (url) => redactUrl(url));
}

export function redactWp10Value(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY_PATTERN.test(key)) return "[redacted]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactWp10Value(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactWp10Value(entryValue, entryKey)]),
    );
  }
  return value;
}

export function parseWp10RolloutReceipt(input: unknown): Wp10RolloutReceipt {
  return wp10RolloutReceiptSchema.parse(input);
}

export function createWp10RolloutReceiptSkeleton(options: {
  releaseId: string;
  environment?: Wp10RolloutReceipt["environment"];
  now?: Date;
}): Wp10RolloutReceipt {
  const generatedAt = (options.now ?? new Date()).toISOString();
  return parseWp10RolloutReceipt({
    receiptVersion: WP10_RECEIPT_VERSION,
    releaseId: options.releaseId,
    environment: options.environment ?? "production",
    mode: "baseline-readback",
    generatedAt,
    sideEffectsPerformed: false,
    resume: { count: 0, sourceGeneratedAt: null },
    decision: { status: "pending", reason: null, decidedAt: null },
    migration: { status: "pending", expected: [], applied: [], evidence: [] },
    artifact: {
      status: "pending",
      storageKey: null,
      sha256: null,
      byteLength: null,
      readbackAt: null,
      evidence: [],
    },
    canary: { status: "pending", storageKey: null, checks: [], evidence: [] },
    smoke: { status: "pending", checks: [] },
    rollback: {
      status: "pending",
      strategy: "Withdraw WP-10 canary items and return consumers to the prior release; preserve additive schema.",
      executedAt: null,
      evidence: [],
    },
  });
}

export function resumeWp10RolloutReceipt(input: unknown, now = new Date()): Wp10RolloutReceipt {
  const previous = parseWp10RolloutReceipt(input);
  const resumed = {
    ...previous,
    generatedAt: now.toISOString(),
    sideEffectsPerformed: false as const,
    resume: {
      count: previous.resume.count + 1,
      sourceGeneratedAt: previous.generatedAt,
    },
  };
  return parseWp10RolloutReceipt(redactWp10Value(resumed));
}

export function wp10CanaryPrefix(releaseId: string): string {
  return `${WP10_CANARY_ROOT}/${releaseIdSchema.parse(releaseId)}/`;
}

export function assertWp10CanaryStorageKey(storageKey: string, releaseId: string): string {
  const prefix = wp10CanaryPrefix(releaseId);
  if (
    !storageKey.startsWith(prefix)
    || storageKey.length === prefix.length
    || storageKey.includes("\\")
    || storageKey.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`storageKey must be a non-traversing object below ${prefix}`);
  }
  return storageKey;
}

export function wp10MutationConfirmation(releaseId: string, storageKey: string): string {
  return `WP10 MUTATE ${releaseIdSchema.parse(releaseId)} ${assertWp10CanaryStorageKey(storageKey, releaseId)}`;
}

export function assertWp10OperatorPreflight(input: {
  mode?: string;
  allowMutation?: string;
  environment?: string;
  releaseId?: string;
  confirmation?: string;
  storageKey?: string;
}): { mode: Wp10OperatorMode; releaseId: string; storageKey: string | null; mutationAllowed: boolean } {
  const mode = input.mode ?? "baseline-readback";
  const releaseId = releaseIdSchema.parse(input.releaseId);

  if (mode === "baseline-readback") {
    return { mode, releaseId, storageKey: null, mutationAllowed: false };
  }
  if (mode !== "mutation") throw new Error("Operator mode must be baseline-readback or mutation.");
  if (input.allowMutation !== "true") throw new Error("Mutation requires WP10_ALLOW_MUTATION=true.");
  if (input.environment !== "production") throw new Error("Mutation requires environment=production.");
  if (!input.storageKey) throw new Error("Mutation requires a canary storageKey.");
  const storageKey = assertWp10CanaryStorageKey(input.storageKey, releaseId);
  const expectedConfirmation = wp10MutationConfirmation(releaseId, storageKey);
  if (input.confirmation !== expectedConfirmation) throw new Error("Mutation confirmation does not exactly match.");

  return { mode, releaseId, storageKey, mutationAllowed: true };
}
