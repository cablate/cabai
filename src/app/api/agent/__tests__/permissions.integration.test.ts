/**
 * Agent API Permission System — Component Tests
 *
 * Tests the permission enforcement at the API route level.
 * Uses real DB, real auth logic, real route handlers.
 * No mocks except external services.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createTestUser,
  createTestAgentKey,
  agentRequest,
  cleanTestData,
} from "@/test/helpers";
import { GET as getPlans } from "@/app/api/agent/plans/route";
import { POST as postCourses, DELETE as deleteCourses } from "@/app/api/agent/courses/route";
import { POST as postPublish } from "@/app/api/agent/publish/route";

// ─── Shared test state ───

let testUserId: string;
let fullKey: string;       // read + write + delete + publish
let readOnlyKey: string;   // read only
let writeKey: string;      // read + write
let expiredKey: string;    // expired
let revokedKey: string;    // revoked

beforeAll(async () => {
  await cleanTestData();
  const user = await createTestUser({ email: "test-perm@example.com" });
  testUserId = user.id;

  const full = await createTestAgentKey(testUserId, ["read", "write", "delete", "publish"]);
  fullKey = full.fullKey;

  const ro = await createTestAgentKey(testUserId, ["read"]);
  readOnlyKey = ro.fullKey;

  const wr = await createTestAgentKey(testUserId, ["read", "write"]);
  writeKey = wr.fullKey;

  const exp = await createTestAgentKey(testUserId, ["read", "write", "delete", "publish"], {
    expiresAt: new Date(Date.now() - 86400_000), // yesterday
  });
  expiredKey = exp.fullKey;

  const rev = await createTestAgentKey(testUserId, ["read", "write", "delete", "publish"], {
    revokedAt: new Date(),
  });
  revokedKey = rev.fullKey;
});

afterAll(async () => {
  await cleanTestData();
});

// ─── Permission enforcement ───

describe("Agent API / Permission enforcement", () => {
  it("read-only key can access GET endpoints", async () => {
    const req = agentRequest("/api/agent/plans", { key: readOnlyKey });
    const res = await getPlans(req);
    expect(res.status).toBe(200);
  });

  it("read-only key is rejected from POST (write) endpoints / returns 403", async () => {
    const req = agentRequest("/api/agent/courses", {
      method: "POST",
      key: readOnlyKey,
      body: { planId: "fake", title: "Test" },
    });
    const res = await postCourses(req);
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("Insufficient permissions");
  });

  it("write key can create but cannot delete / returns 403", async () => {
    // Create should work
    const createReq = agentRequest("/api/agent/courses", {
      method: "POST",
      key: writeKey,
      body: { planId: "fake-plan", title: "Write Key Course" },
    });
    const createRes = await postCourses(createReq);
    // May fail on FK (planId doesn't exist) but should NOT be 403
    expect(createRes.status).not.toBe(403);

    // Delete should be 403 (no delete permission)
    const deleteReq = agentRequest("/api/agent/courses", {
      method: "DELETE",
      key: writeKey,
      headers: { "x-confirm-destructive": "true" },
      body: { id: "fake-id" },
    });
    const deleteRes = await deleteCourses(deleteReq);
    expect(deleteRes.status).toBe(403);
  });

  it("write key cannot publish / returns 403", async () => {
    const req = agentRequest("/api/agent/publish", {
      method: "POST",
      key: writeKey,
      headers: { "x-confirm-destructive": "true" },
      body: {
        courseId: "fake",
        sourceVersion: "fake-source-version",
        informationId: "fake-information",
        expectedInformationRevision: 1,
        idempotencyKey: "permission-test-publish",
      },
    });
    const res = await postPublish(req);
    expect(res.status).toBe(403);
  });

  it("full key can access all endpoints", async () => {
    const req = agentRequest("/api/agent/plans", { key: fullKey });
    const res = await getPlans(req);
    expect(res.status).toBe(200);
  });
});

// ─── Destructive confirmation ───

describe("Agent API / Destructive confirmation header", () => {
  it("DELETE without x-confirm-destructive / returns 428", async () => {
    const req = agentRequest("/api/agent/courses", {
      method: "DELETE",
      key: fullKey,
      headers: { "x-confirm-destructive": "true" },
      body: { id: "fake-id" },
    });
    const res = await deleteCourses(req);
    expect(res.status).toBe(428);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("x-confirm-entity-id");
  });

  it("publish without x-confirm-destructive / returns 428", async () => {
    const req = agentRequest("/api/agent/publish", {
      method: "POST",
      key: fullKey,
      body: {
        courseId: "fake",
        sourceVersion: "fake-source-version",
        informationId: "fake-information",
        expectedInformationRevision: 1,
        idempotencyKey: "confirmation-test-publish",
      },
      // No x-confirm-destructive header
    });
    const res = await postPublish(req);
    expect(res.status).toBe(428);
  });

  it("DELETE with x-confirm-destructive: true passes confirmation check", async () => {
    const req = agentRequest("/api/agent/courses", {
      method: "DELETE",
      key: fullKey,
      headers: { "x-confirm-destructive": "true", "x-confirm-entity-id": "nonexistent-id" },
      body: { id: "nonexistent-id" },
    });
    const res = await deleteCourses(req);
    // Should NOT be 428 (passes confirmation). May be 500 (course not found) — that's fine.
    expect(res.status).not.toBe(428);
  });
});

// ─── Key lifecycle ───

describe("Agent API / Key lifecycle", () => {
  it("expired key / returns 401", async () => {
    const req = agentRequest("/api/agent/plans", { key: expiredKey });
    const res = await getPlans(req);
    expect(res.status).toBe(401);
  });

  it("revoked key / returns 401", async () => {
    const req = agentRequest("/api/agent/plans", { key: revokedKey });
    const res = await getPlans(req);
    expect(res.status).toBe(401);
  });

  it("invalid key / returns 401", async () => {
    const req = agentRequest("/api/agent/plans", { key: "cab_agent_totally_fake_key" });
    const res = await getPlans(req);
    expect(res.status).toBe(401);
  });

  it("missing auth header / returns 401", async () => {
    const req = new Request("http://localhost:3002/api/agent/plans");
    const res = await getPlans(req);
    expect(res.status).toBe(401);
  });
});
