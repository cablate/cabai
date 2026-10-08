import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as LibraryServiceModule from "@/lib/services/library-service";

const mocks = vi.hoisted(() => ({
  requireAgent: vi.fn(),
  requireDestructiveConfirmation: vi.fn(),
  createLibraryEntry: vi.fn(),
  getLibraryEntry: vi.fn(),
  getLibraryEntryReadiness: vi.fn(),
  listLibraryEntries: vi.fn(),
  updateLibraryEntry: vi.fn(),
  withdrawLibraryEntry: vi.fn(),
  publishLibraryInformationBundle: vi.fn(),
}));

vi.mock("@/lib/agent-auth", () => ({
  requireAgent: mocks.requireAgent,
  requireDestructiveConfirmation: mocks.requireDestructiveConfirmation,
}));
vi.mock("@/lib/services/library-service", async (importOriginal) => ({
  ...await importOriginal<typeof LibraryServiceModule>(),
  createLibraryEntry: mocks.createLibraryEntry,
  getLibraryEntry: mocks.getLibraryEntry,
  getLibraryEntryReadiness: mocks.getLibraryEntryReadiness,
  listLibraryEntries: mocks.listLibraryEntries,
  updateLibraryEntry: mocks.updateLibraryEntry,
  withdrawLibraryEntry: mocks.withdrawLibraryEntry,
}));
vi.mock("@/lib/services/publication-bundle-service", () => ({
  publishLibraryInformationBundle: mocks.publishLibraryInformationBundle,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

import { GET as listEntries, POST as createEntry } from "@/app/api/agent/library-entries/route";
import { GET as getEntry, PATCH as updateEntry } from "@/app/api/agent/library-entries/[id]/route";
import { POST as readiness } from "@/app/api/agent/library-entries/[id]/readiness/route";
import { POST as publish } from "@/app/api/agent/library-entries/[id]/publish/route";
import { POST as withdraw } from "@/app/api/agent/library-entries/[id]/withdraw/route";

const createPayload = {
  slug: "agent-guides",
  title: "Agent Guides",
  summary: "Practical guides for Agent users.",
  bodyMarkdown: "# Agent Guides\n\nUse the documented APIs.",
  tags: ["agent", "guide"],
  featured: true,
};

function libraryEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "library-1",
    ...createPayload,
    status: "draft",
    revision: 1,
    publishedAt: null,
    withdrawnAt: null,
    createdAt: new Date("2026-07-16T00:00:00.000Z"),
    updatedAt: new Date("2026-07-16T00:00:00.000Z"),
    ...overrides,
  };
}

function context(id = "library-1") {
  return { params: Promise.resolve({ id }) };
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function publishRequest(overrides: Record<string, unknown> = {}) {
  return jsonRequest("/api/agent/library-entries/library-1/publish", {
    libraryId: "library-1",
    informationId: "information-1",
    expectedLibraryRevision: 1,
    expectedInformationRevision: 2,
    ...overrides,
  }, {
    "idempotency-key": "publish-library-1",
    "x-confirm-destructive": "true",
    "x-confirm-entity-id": "library-1",
  });
}

describe("Library Admin Agent route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireDestructiveConfirmation.mockImplementation(() => undefined);
    mocks.requireAgent.mockResolvedValue({
      keyId: "key-1",
      agentId: "agent-key:key-1",
      name: "Library Agent",
      permissions: [],
    });
  });

  it("uses library:read for list, detail, and readiness", async () => {
    mocks.listLibraryEntries.mockResolvedValue({ ok: true, value: [libraryEntry()] });
    mocks.getLibraryEntry.mockResolvedValue({ ok: true, value: libraryEntry() });
    mocks.getLibraryEntryReadiness.mockResolvedValue({ ok: true, value: { ready: true, issues: [] } });

    await listEntries(new Request("https://example.com/api/agent/library-entries"));
    await getEntry(new Request("https://example.com/api/agent/library-entries/library-1"), context());
    await readiness(new Request("https://example.com/api/agent/library-entries/library-1/readiness", { method: "POST" }), context());

    expect(mocks.requireAgent).toHaveBeenNthCalledWith(1, expect.any(Request), "library:read");
    expect(mocks.requireAgent).toHaveBeenNthCalledWith(2, expect.any(Request), "library:read");
    expect(mocks.requireAgent).toHaveBeenNthCalledWith(3, expect.any(Request), "library:read");
    expect(mocks.getLibraryEntry).toHaveBeenCalledWith("library-1");
    expect(mocks.getLibraryEntryReadiness).toHaveBeenCalledWith("library-1");
  });

  it("uses library:write and forwards the parsed revision update", async () => {
    mocks.updateLibraryEntry.mockResolvedValue({ ok: true, value: libraryEntry({ title: "Updated", revision: 2 }) });
    const request = new Request("https://example.com/api/agent/library-entries/library-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedRevision: 1, title: "Updated" }),
    });

    const response = await updateEntry(request, context());

    expect(mocks.requireAgent).toHaveBeenCalledWith(expect.any(Request), "library:write");
    expect(mocks.updateLibraryEntry).toHaveBeenCalledWith("library-1", {
      expectedRevision: 1,
      title: "Updated",
    });
    expect(response.status).toBe(200);
  });

  it("creates once with a deterministic resource ID and returns 201", async () => {
    mocks.getLibraryEntry.mockResolvedValue({ ok: false, kind: "not-found", message: "missing" });
    mocks.createLibraryEntry.mockImplementation(async (_input, options) => ({
      ok: true,
      value: libraryEntry({ id: options.resourceId }),
    }));
    const request = jsonRequest("/api/agent/library-entries", createPayload, {
      "idempotency-key": "create-library-guides",
    });

    const response = await createEntry(request);

    expect(mocks.requireAgent).toHaveBeenCalledWith(expect.any(Request), "library:write");
    expect(mocks.createLibraryEntry).toHaveBeenCalledWith(createPayload, {
      resourceId: expect.stringMatching(/^idem_[a-f0-9]{48}$/),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.id).toMatch(/^idem_[a-f0-9]{48}$/);
  });

  it("returns the exact existing create replay as 200 without creating again", async () => {
    mocks.getLibraryEntry.mockResolvedValue({ ok: true, value: libraryEntry({ id: "idem_existing" }) });
    const request = jsonRequest("/api/agent/library-entries", createPayload, {
      "idempotency-key": "create-library-guides",
    });

    const response = await createEntry(request);

    expect(response.status).toBe(200);
    expect(mocks.createLibraryEntry).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ data: { id: "idem_existing" } });
  });

  it("rejects idempotency reuse with a different parsed payload", async () => {
    mocks.getLibraryEntry.mockResolvedValue({
      ok: true,
      value: libraryEntry({ title: "Different title" }),
    });
    const request = jsonRequest("/api/agent/library-entries", createPayload, {
      "idempotency-key": "create-library-guides",
    });

    const response = await createEntry(request);

    expect(response.status).toBe(409);
    expect(mocks.createLibraryEntry).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ kind: "conflict" });
  });

  it("publishes through the coordinated bundle with publisher scope and stable actor", async () => {
    mocks.publishLibraryInformationBundle.mockResolvedValue({
      ok: true,
      value: { library: libraryEntry({ status: "published", revision: 2 }), information: { id: "information-1" } },
    });
    const request = publishRequest();

    const response = await publish(request, context());

    expect(mocks.requireAgent).toHaveBeenCalledWith(request, "library:publish");
    expect(mocks.requireDestructiveConfirmation).toHaveBeenCalledWith(request, "library-1");
    expect(mocks.publishLibraryInformationBundle).toHaveBeenCalledWith({
      libraryId: "library-1",
      informationId: "information-1",
      expectedLibraryRevision: 1,
      expectedInformationRevision: 2,
      actor: { type: "agent", id: "agent-key:key-1", name: "Library Agent" },
      idempotencyKey: "publish-library-1",
    });
    expect(response.status).toBe(200);
  });

  it("rejects publish path/body identity mismatch before confirmation or mutation", async () => {
    const response = await publish(publishRequest({ libraryId: "library-2" }), context());

    expect(response.status).toBe(409);
    expect(mocks.requireDestructiveConfirmation).not.toHaveBeenCalled();
    expect(mocks.publishLibraryInformationBundle).not.toHaveBeenCalled();
  });

  it("delegates publish confirmation and preserves its 428 response", async () => {
    mocks.requireDestructiveConfirmation.mockImplementation(() => {
      throw Response.json({ error: "confirmation required" }, { status: 428 });
    });

    const response = await publish(publishRequest(), context());

    expect(response.status).toBe(428);
    expect(mocks.requireDestructiveConfirmation).toHaveBeenCalledWith(expect.any(Request), "library-1");
    expect(mocks.publishLibraryInformationBundle).not.toHaveBeenCalled();
  });

  it("withdraws with publisher scope, matching confirmation, and expected revision", async () => {
    mocks.withdrawLibraryEntry.mockResolvedValue({
      ok: true,
      value: libraryEntry({ status: "withdrawn", revision: 3 }),
    });
    const request = jsonRequest("/api/agent/library-entries/library-1/withdraw", {
      expectedRevision: 2,
    }, {
      "x-confirm-destructive": "true",
      "x-confirm-entity-id": "library-1",
    });

    const response = await withdraw(request, context());

    expect(mocks.requireAgent).toHaveBeenCalledWith(request, "library:publish");
    expect(mocks.requireDestructiveConfirmation).toHaveBeenCalledWith(request, "library-1");
    expect(mocks.withdrawLibraryEntry).toHaveBeenCalledWith({ id: "library-1", expectedRevision: 2 });
    expect(response.status).toBe(200);
  });

  it.each([
    ["not-found", 404],
    ["stale-revision", 409],
    ["validation-failed", 422],
    ["prerequisite-unavailable", 503],
  ])("maps %s domain failures to HTTP %i", async (kind, status) => {
    mocks.getLibraryEntry.mockResolvedValue({
      ok: false,
      kind,
      message: `Library ${kind}`,
      ...(kind === "prerequisite-unavailable" ? { retryable: true } : {}),
    });

    const response = await getEntry(
      new Request("https://example.com/api/agent/library-entries/library-1"),
      context(),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ kind, error: `Library ${kind}` });
  });
});
