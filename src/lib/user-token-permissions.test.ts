import { describe, expect, it } from "vitest";
import {
  normalizeUserTokenScopes,
  USER_TOKEN_SAFE_PROFILE,
  userTokenHasScope,
} from "./user-token-permissions";

describe("fixed User Agent token profile", () => {
  it("normalizes new and legacy storage to the same server-owned capabilities", () => {
    expect(normalizeUserTokenScopes(undefined)).toEqual(USER_TOKEN_SAFE_PROFILE);
    expect(normalizeUserTokenScopes(["course:read"])).toEqual(USER_TOKEN_SAFE_PROFILE);
    expect(normalizeUserTokenScopes(["*"])).toEqual(USER_TOKEN_SAFE_PROFILE);
    expect(normalizeUserTokenScopes(["admin:write", "made-up"])).toEqual(USER_TOKEN_SAFE_PROFILE);
  });

  it("returns a new array so callers cannot mutate the canonical profile", () => {
    const normalized = normalizeUserTokenScopes([]);
    normalized.pop();
    expect(USER_TOKEN_SAFE_PROFILE).toEqual([
      "course:read",
      "skill:read",
      "information:read",
      "information:ack",
    ]);
  });

  it("never treats wildcard or unknown scopes as authority", () => {
    expect(userTokenHasScope(normalizeUserTokenScopes(["*"]), "information:ack")).toBe(true);
    expect(userTokenHasScope(["*"], "information:ack")).toBe(false);
    expect(userTokenHasScope(normalizeUserTokenScopes([]), "admin:write")).toBe(false);
  });
});
