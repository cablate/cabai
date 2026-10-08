import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userApiTokens } from "@/lib/db/schema";
import { cleanTestData, createTestUser } from "@/test/helpers";
import {
  generateUserToken,
  listUserTokens,
  revokeUserToken,
  validateUserToken,
} from "@/lib/user-auth";
import { USER_TOKEN_SAFE_PROFILE } from "@/lib/user-token-permissions";

describe("User Agent fixed token profile", () => {
  beforeEach(async () => {
    await cleanTestData();
  });

  afterAll(async () => {
    await cleanTestData();
  });

  it("persists the safe profile for new tokens and reports it from validation and listing", async () => {
    const user = await createTestUser();
    const generated = await generateUserToken(user.id);

    const stored = await db.query.userApiTokens.findFirst({
      where: eq(userApiTokens.id, generated.tokenId),
    });
    expect(stored?.scopes).toEqual(USER_TOKEN_SAFE_PROFILE);
    expect(await validateUserToken(`Bearer ${generated.fullToken}`)).toMatchObject({
      userId: user.id,
      tokenId: generated.tokenId,
      scopes: USER_TOKEN_SAFE_PROFILE,
    });
    expect(await listUserTokens(user.id)).toMatchObject([{
      id: generated.tokenId,
      scopes: USER_TOKEN_SAFE_PROFILE,
    }]);
  });

  it("normalizes legacy values without expanding authority and still rejects revoked or expired tokens", async () => {
    const user = await createTestUser();
    const legacy = await generateUserToken(user.id);
    await db.update(userApiTokens).set({ scopes: ["*"] }).where(eq(userApiTokens.id, legacy.tokenId));

    expect(await validateUserToken(`Bearer ${legacy.fullToken}`)).toMatchObject({
      userId: user.id,
      tokenId: legacy.tokenId,
      scopes: USER_TOKEN_SAFE_PROFILE,
    });
    expect((await listUserTokens(user.id))[0]?.scopes).toEqual(USER_TOKEN_SAFE_PROFILE);

    await revokeUserToken(legacy.tokenId);
    expect(await validateUserToken(`Bearer ${legacy.fullToken}`)).toBeNull();

    const expired = await generateUserToken(user.id);
    await db.update(userApiTokens)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(userApiTokens.id, expired.tokenId));
    expect(await validateUserToken(`Bearer ${expired.fullToken}`)).toBeNull();
  });
});
