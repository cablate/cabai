export const USER_TOKEN_SAFE_PROFILE = [
  "course:read",
  "skill:read",
  "information:read",
  "information:ack",
] as const;

export type UserTokenPermission = (typeof USER_TOKEN_SAFE_PROFILE)[number];

/**
 * User Agent capabilities are intentionally server-owned. Stored legacy values
 * are accepted only as token metadata; they never expand or reduce the effective
 * profile of an otherwise valid token.
 */
export function normalizeUserTokenScopes(storedScopes: readonly string[] | null | undefined): UserTokenPermission[] {
  void storedScopes;
  return [...USER_TOKEN_SAFE_PROFILE];
}

export function userTokenHasScope(
  effectiveScopes: readonly string[],
  requiredScope: string,
): boolean {
  return USER_TOKEN_SAFE_PROFILE.includes(requiredScope as UserTokenPermission)
    && effectiveScopes.includes(requiredScope);
}
