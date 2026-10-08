import { describe, expect, it } from "vitest";
import {
  bootstrapTokenMatches,
  FIRST_ADMIN_BOOTSTRAP_MIN_TOKEN_LENGTH,
  getFirstAdminBootstrapToken,
  isFirstAdminBootstrapConfigured,
} from "./first-admin-bootstrap";

const token = "bootstrap-token-123456789012345678901234";

describe("first-admin bootstrap configuration", () => {
  it("enables only for a trimmed token at the minimum length", () => {
    expect(token.length).toBeGreaterThanOrEqual(FIRST_ADMIN_BOOTSTRAP_MIN_TOKEN_LENGTH);
    expect(getFirstAdminBootstrapToken({ ADMIN_BOOTSTRAP_TOKEN: `  ${token}  ` })).toBe(token);
    expect(isFirstAdminBootstrapConfigured({ ADMIN_BOOTSTRAP_TOKEN: token })).toBe(true);
    expect(isFirstAdminBootstrapConfigured({ ADMIN_BOOTSTRAP_TOKEN: "too-short" })).toBe(false);
    expect(isFirstAdminBootstrapConfigured({})).toBe(false);
  });

  it("matches the token without exposing a length oracle", () => {
    const environment = { ADMIN_BOOTSTRAP_TOKEN: token };

    expect(bootstrapTokenMatches(`  ${token}  `, environment)).toBe(true);
    expect(bootstrapTokenMatches("wrong-token", environment)).toBe(false);
    expect(bootstrapTokenMatches(token.slice(0, -1), environment)).toBe(false);
    expect(bootstrapTokenMatches(token, {})).toBe(false);
  });
});
