"use server";

import { auth } from "@/lib/auth";
import {
  generateUserToken,
  revokeUserToken,
  listUserTokens,
} from "@/lib/user-auth";

// ─── Public types ───

export interface TokenRow {
  id: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export type CreateTokenResult =
  | { success: true; fullToken: string; tokenId: string; prefix: string }
  | { success: false; error: string };

export type RevokeTokenResult =
  | { success: true }
  | { success: false; error: string };

export type ListTokensResult =
  | { success: true; tokens: TokenRow[] }
  | { success: false; error: string };

// ─── Actions ───

export async function createUserTokenAction(
  expiresInDays?: number,
): Promise<CreateTokenResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "請先登入" };
    }

    const { fullToken, tokenId, prefix } = await generateUserToken(
      session.user.id,
      expiresInDays,
    );

    return { success: true, fullToken, tokenId, prefix };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "無法產生權杖",
    };
  }
}

export async function revokeUserTokenAction(
  tokenId: string,
): Promise<RevokeTokenResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "請先登入" };
    }

    // Verify the token belongs to the current user
    const tokens = await listUserTokens(session.user.id);
    const ownsToken = tokens.some((t) => t.id === tokenId);
    if (!ownsToken) {
      return { success: false, error: "找不到該權杖" };
    }

    await revokeUserToken(tokenId);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "無法撤銷權杖",
    };
  }
}

export async function listUserTokensAction(): Promise<ListTokensResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "請先登入" };
    }

    const tokens = await listUserTokens(session.user.id);

    // Serialize Date fields so they cross the server/client boundary cleanly
    const serialized: TokenRow[] = tokens.map((t) => ({
      ...t,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    }));

    return { success: true, tokens: serialized };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "無法取得權杖列表",
    };
  }
}
