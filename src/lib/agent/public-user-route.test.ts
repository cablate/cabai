import { beforeEach, describe, expect, it, vi } from "vitest";

const { validateUserToken } = vi.hoisted(() => ({ validateUserToken: vi.fn() }));

vi.mock("@/lib/user-auth", () => ({ validateUserToken }));

import { rejectInvalidSuppliedPublicCredential } from "./public-user-route";

describe("public Agent credential boundary", () => {
  beforeEach(() => validateUserToken.mockReset());

  it("allows a request with no credential without invoking user auth", async () => {
    await expect(rejectInvalidSuppliedPublicCredential(new Request("https://example.test"))).resolves.toBeUndefined();
    expect(validateUserToken).not.toHaveBeenCalled();
  });

  it("allows a valid supplied user credential but does not return an authenticated viewer", async () => {
    validateUserToken.mockResolvedValue({ userId: "user-1", tokenId: "token-1", scopes: ["course:read"] });
    const request = new Request("https://example.test", {
      headers: { authorization: "Bearer cab_user_valid" },
    });
    await expect(rejectInvalidSuppliedPublicCredential(request)).resolves.toBeUndefined();
  });

  it("rejects an invalid supplied credential instead of silently downgrading", async () => {
    validateUserToken.mockResolvedValue(null);
    const request = new Request("https://example.test", {
      headers: { authorization: "Bearer wrong" },
    });

    try {
      await rejectInvalidSuppliedPublicCredential(request);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(401);
    }
  });
});
