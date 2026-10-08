import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => { throw new Error("Disabled ingress must not load the database"); });
vi.mock("@/lib/marketplace-processor", () => { throw new Error("Disabled ingress must not load the processor"); });
import { POST } from "./route";

describe("legacy Marketplace ingress quarantine", () => {
  it("returns non-success without loading persistence or processing", async () => {
    const response = await POST();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Legacy Marketplace webhook is unavailable; contact the site operator." });
  });
});
