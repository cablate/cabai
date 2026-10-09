import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { cleanTestData, createTestUser } from "@/test/helpers";
import {
  bootstrapFirstAdmin,
  getFirstAdminBootstrapStatus,
} from "./first-admin-bootstrap";
import type { FirstAdminBootstrapError } from "./first-admin-bootstrap";

const token = "bootstrap-token-123456789012345678901234";
const originalToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

beforeAll(() => {
  process.env.ADMIN_BOOTSTRAP_TOKEN = token;
});

beforeEach(async () => {
  await cleanTestData();
  process.env.ADMIN_BOOTSTRAP_TOKEN = token;
});

afterAll(async () => {
  await cleanTestData();
  if (originalToken === undefined) delete process.env.ADMIN_BOOTSTRAP_TOKEN;
  else process.env.ADMIN_BOOTSTRAP_TOKEN = originalToken;
});

describe("first-admin bootstrap persistence", () => {
  it("is ready only when no admin exists and a valid token is configured", async () => {
    expect(await getFirstAdminBootstrapStatus()).toBe("ready");
    await createTestUser({ email: "test-bootstrap-member@example.com", role: "member" });
    expect(await getFirstAdminBootstrapStatus()).toBe("ready");
    delete process.env.ADMIN_BOOTSTRAP_TOKEN;
    expect(await getFirstAdminBootstrapStatus()).toBe("disabled");
    process.env.ADMIN_BOOTSTRAP_TOKEN = "too-short";
    expect(await getFirstAdminBootstrapStatus()).toBe("disabled");
  });

  it("reports completed for an existing admin regardless of token configuration", async () => {
    await createTestUser({ email: "test-bootstrap-admin@example.com", role: "admin" });
    expect(await getFirstAdminBootstrapStatus()).toBe("completed");
    delete process.env.ADMIN_BOOTSTRAP_TOKEN;
    expect(await getFirstAdminBootstrapStatus()).toBe("completed");
  });

  it("creates the first admin and rejects a second bootstrap", async () => {
    const created = await bootstrapFirstAdmin({
      email: "test-bootstrap-owner@example.com",
      token,
    });

    expect(created.email).toBe("test-bootstrap-owner@example.com");
    expect(process.env.ADMIN_BOOTSTRAP_TOKEN).toBe(token);
    expect(await getFirstAdminBootstrapStatus()).toBe("completed");
    await expect(
      bootstrapFirstAdmin({ email: "test-bootstrap-second@example.com", token }),
    ).rejects.toMatchObject({ code: "already_completed" } satisfies Partial<FirstAdminBootstrapError>);

    const admins = await db
      .select({ email: users.email, role: users.role })
      .from(users)
      .where(eq(users.role, "admin"));
    expect(admins).toEqual([{ email: created.email, role: "admin" }]);
  });

  it("returns to ready when the last admin no longer exists and the token remains", async () => {
    const existing = await createTestUser({ email: "test-bootstrap-removed@example.com", role: "admin" });
    await db.update(users).set({ role: "member" }).where(eq(users.id, existing.id));

    expect(await getFirstAdminBootstrapStatus()).toBe("ready");
    const promoted = await bootstrapFirstAdmin({ email: existing.email, token });
    expect(promoted.id).toBe(existing.id);
    expect(await getFirstAdminBootstrapStatus()).toBe("completed");
  });

  it("promotes an existing member without creating a duplicate user", async () => {
    const existing = await createTestUser({
      email: "test-bootstrap-existing@example.com",
      role: "member",
    });

    const promoted = await bootstrapFirstAdmin({
      email: existing.email.toUpperCase(),
      token,
    });

    expect(promoted.id).toBe(existing.id);
    const [row] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, existing.email));
    expect(row).toEqual({ id: existing.id, role: "admin" });
  });

  it("rejects invalid tokens without changing the database", async () => {
    await expect(
      bootstrapFirstAdmin({
        email: "test-bootstrap-invalid@example.com",
        token: "wrong-token",
      }),
    ).rejects.toMatchObject({ code: "invalid_token" } satisfies Partial<FirstAdminBootstrapError>);

    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.email, "test-bootstrap-invalid@example.com"));
    expect(rows).toEqual([]);
  });

  it("serializes simultaneous first-admin attempts", async () => {
    const results = await Promise.allSettled([
      bootstrapFirstAdmin({ email: "test-bootstrap-race-a@example.com", token }),
      bootstrapFirstAdmin({ email: "test-bootstrap-race-b@example.com", token }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: expect.objectContaining({ code: "already_completed" }) });
  });
});
