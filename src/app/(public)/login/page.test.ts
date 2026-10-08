import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("./login-card", () => ({ LoginCard: () => null }));
afterEach(() => vi.unstubAllEnvs());
describe("server-side Google availability", () => {
  it.each([
    ["", "", false], ["client", "", false], ["", "secret", false],
    [" ", "secret", false], ["client", "secret", true],
  ])("only enables complete credentials (case %#)", async (id, secret, enabled) => {
    vi.stubEnv("AUTH_GOOGLE_ID", id as string);
    vi.stubEnv("AUTH_GOOGLE_SECRET", secret as string);
    const page = await LoginPage({ searchParams: Promise.resolve({ callbackUrl: "/dashboard" }) });
    expect(page.props.children.props.googleEnabled).toBe(enabled);
    expect(page.props.children.props).not.toHaveProperty("clientSecret");
    expect(page.props.children.props).not.toHaveProperty("clientId");
  });
});
