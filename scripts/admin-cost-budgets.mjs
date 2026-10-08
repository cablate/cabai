export const ADMIN_COST_BUDGETS = Object.freeze({
  adminOverview: Object.freeze({ maxDbQueries: 20, maxServerTimeMs: 10_000, maxPayloadBytes: 8_192, maxClientRows: 12 }),
  tracking: Object.freeze({ maxDbQueries: 2, maxServerTimeMs: 10_000, maxPayloadBytes: 32_768, maxClientRows: 20, maxEmailFields: 20 }),
  audit: Object.freeze({ maxDbQueries: 2, maxServerTimeMs: 10_000, maxPayloadBytes: 131_072, maxClientRows: 50 }),
  systemHealth: Object.freeze({ maxDbQueries: 7, maxServerTimeMs: 10_000, maxPayloadBytes: 8_192, maxClientRows: 7 }),
  agentParity: Object.freeze({ maxUndocumented: 0, maxStale: 0 }),
});

const METRIC_LIMITS = [
  ["dbQueries", "maxDbQueries"],
  ["serverTimeMs", "maxServerTimeMs"],
  ["payloadBytes", "maxPayloadBytes"],
  ["clientRows", "maxClientRows"],
  ["emailFields", "maxEmailFields"],
];

export function evaluateAdminCostReport(report) {
  const failures = [];
  if (!Array.isArray(report?.fixtures) || report.fixtures.length === 0) {
    failures.push("At least one workload fixture must be measured.");
    return failures;
  }

  for (const fixture of report.fixtures) {
    if (!fixture?.name || !fixture.metrics) {
      failures.push("Each fixture must include a name and metrics.");
      continue;
    }
    for (const [surface, budget] of Object.entries(ADMIN_COST_BUDGETS)) {
      if (surface === "agentParity") continue;
      const metrics = fixture.metrics[surface];
      if (!metrics || typeof metrics !== "object") {
        failures.push(`${fixture.name}/${surface}: measurement is missing.`);
        continue;
      }
      for (const [metric, budgetKey] of METRIC_LIMITS) {
        const limit = budget[budgetKey];
        if (limit === undefined) continue;
        const value = metrics[metric];
        if (!Number.isFinite(value)) {
          failures.push(`${fixture.name}/${surface}: ${metric} is unavailable.`);
        } else if (value > limit) {
          failures.push(`${fixture.name}/${surface}: ${metric}=${value} exceeds budget ${limit}.`);
        }
      }
    }
  }

  const parity = report.agentParity;
  if (!parity || !Number.isFinite(parity.undocumented) || !Number.isFinite(parity.stale)) {
    failures.push("Agent route/OpenAPI parity metrics are unavailable.");
  } else {
    if (parity.undocumented > ADMIN_COST_BUDGETS.agentParity.maxUndocumented) {
      failures.push(`Agent route/OpenAPI parity has ${parity.undocumented} undocumented routes.`);
    }
    if (parity.stale > ADMIN_COST_BUDGETS.agentParity.maxStale) {
      failures.push(`Agent route/OpenAPI parity has ${parity.stale} stale operations.`);
    }
  }

  return failures;
}
