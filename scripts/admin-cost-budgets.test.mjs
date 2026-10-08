import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAdminCostReport } from "./admin-cost-budgets.mjs";

function fixture(overrides = {}) {
  return {
    name: "small",
    metrics: {
      adminOverview: { dbQueries: 10, serverTimeMs: 120, payloadBytes: 1024, clientRows: 2 },
      tracking: { dbQueries: 2, serverTimeMs: 80, payloadBytes: 1200, clientRows: 20, emailFields: 20 },
      audit: { dbQueries: 1, serverTimeMs: 55, payloadBytes: 2000, clientRows: 50 },
      systemHealth: { dbQueries: 7, serverTimeMs: 90, payloadBytes: 800, clientRows: 7 },
      ...overrides,
    },
  };
}

test("accepts complete metrics within the documented budgets", () => {
  assert.deepEqual(evaluateAdminCostReport({
    fixtures: [fixture()],
    agentParity: { implemented: 12, documented: 12, undocumented: 0, stale: 0 },
  }), []);
});

test("fails CI when query, payload, row, or email budgets regress", () => {
  const report = {
    fixtures: [fixture({
      tracking: { dbQueries: 3, serverTimeMs: 80, payloadBytes: 40_000, clientRows: 25, emailFields: 25 },
    })],
    agentParity: { implemented: 12, documented: 11, undocumented: 1, stale: 0 },
  };
  const failures = evaluateAdminCostReport(report);
  assert.equal(failures.length, 5);
  assert.ok(failures.some((failure) => failure.includes("dbQueries=3")));
  assert.ok(failures.some((failure) => failure.includes("payloadBytes=40000")));
  assert.ok(failures.some((failure) => failure.includes("clientRows=25")));
  assert.ok(failures.some((failure) => failure.includes("emailFields=25")));
  assert.ok(failures.some((failure) => failure.includes("1 undocumented routes")));
});

test("fails closed if a fixture or a surface measurement is missing", () => {
  const failures = evaluateAdminCostReport({
    fixtures: [{ name: "large", metrics: { tracking: {} } }],
    agentParity: { undocumented: 0, stale: 0 },
  });
  assert.ok(failures.some((failure) => failure.includes("adminOverview: measurement is missing")));
  assert.ok(failures.some((failure) => failure.includes("tracking: dbQueries is unavailable")));
});
