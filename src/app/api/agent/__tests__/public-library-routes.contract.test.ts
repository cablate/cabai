import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rejectInvalidSuppliedPublicCredential: vi.fn(),
  listPublishedLibraryEntries: vi.fn(),
  getPublishedLibraryEntry: vi.fn(),
}));

vi.mock("@/lib/agent/public-user-route", () => ({
  rejectInvalidSuppliedPublicCredential: mocks.rejectInvalidSuppliedPublicCredential,
}));
vi.mock("@/lib/services/library-service", () => ({
  listPublishedLibraryEntries: mocks.listPublishedLibraryEntries,
  getPublishedLibraryEntry: mocks.getPublishedLibraryEntry,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

import { GET as listEntries } from "@/app/api/agent/public/v1/library/route";
import { GET as getEntry } from "@/app/api/agent/public/v1/library/[idOrSlug]/route";

const summary = {
  id: "library-1",
  slug: "agent-guides",
  title: "Agent Guides",
  summary: "Practical guides for Agent users.",
  tags: ["agent", "guide"],
  featured: true,
  revision: 2,
  publishedAt: new Date("2026-07-16T00:00:00.000Z"),
  updatedAt: new Date("2026-07-16T00:00:00.000Z"),
};

function context(idOrSlug: string) {
  return { params: Promise.resolve({ idOrSlug }) };
}

describe("Public Library Agent route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rejectInvalidSuppliedPublicCredential.mockResolvedValue(undefined);
    mocks.listPublishedLibraryEntries.mockResolvedValue({ ok: true, value: [summary] });
    mocks.getPublishedLibraryEntry.mockResolvedValue({
      ok: true,
      value: { ...summary, bodyMarkdown: "# Agent Guides\n\nUse the documented APIs." },
    });
  });

  it("allows anonymous list and returns summaries without bodyMarkdown", async () => {
    const request = new Request("https://example.com/api/agent/public/v1/library");

    const response = await listEntries(request);

    expect(mocks.rejectInvalidSuppliedPublicCredential).toHaveBeenCalledWith(request);
    expect(mocks.listPublishedLibraryEntries).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual([expect.objectContaining({ id: "library-1", slug: "agent-guides" })]);
    expect(body.data[0]).not.toHaveProperty("bodyMarkdown");
  });

  it("rejects an invalid supplied credential without falling back to the anonymous service", async () => {
    mocks.rejectInvalidSuppliedPublicCredential.mockRejectedValueOnce(
      Response.json({ error: "Invalid, revoked, or expired token" }, { status: 401 }),
    );
    const request = new Request("https://example.com/api/agent/public/v1/library", {
      headers: { authorization: "Bearer invalid" },
    });

    const response = await listEntries(request);

    expect(response.status).toBe(401);
    expect(mocks.listPublishedLibraryEntries).not.toHaveBeenCalled();
  });

  it("does not upgrade output when a valid credential is supplied", async () => {
    const request = new Request("https://example.com/api/agent/public/v1/library", {
      headers: { authorization: "Bearer cab_user_valid" },
    });

    const response = await listEntries(request);

    expect(mocks.rejectInvalidSuppliedPublicCredential).toHaveBeenCalledWith(request);
    expect(mocks.listPublishedLibraryEntries).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).not.toHaveProperty("bodyMarkdown");
  });

  it.each(["library-1", "agent-guides"])("dispatches detail by ID or slug: %s", async (idOrSlug) => {
    const request = new Request(`https://example.com/api/agent/public/v1/library/${idOrSlug}`);

    const response = await getEntry(request, context(idOrSlug));

    expect(mocks.rejectInvalidSuppliedPublicCredential).toHaveBeenCalledWith(request);
    expect(mocks.getPublishedLibraryEntry).toHaveBeenCalledWith(idOrSlug);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        id: "library-1",
        slug: "agent-guides",
        bodyMarkdown: "# Agent Guides\n\nUse the documented APIs.",
      },
    });
  });

  it("rejects an invalid supplied credential on detail before service dispatch", async () => {
    mocks.rejectInvalidSuppliedPublicCredential.mockRejectedValueOnce(
      Response.json({ error: "Invalid, revoked, or expired token" }, { status: 401 }),
    );
    const request = new Request("https://example.com/api/agent/public/v1/library/library-1", {
      headers: { authorization: "Bearer invalid" },
    });

    const response = await getEntry(request, context("library-1"));

    expect(response.status).toBe(401);
    expect(mocks.getPublishedLibraryEntry).not.toHaveBeenCalled();
  });

  it("maps canonical service failures through the shared domain response", async () => {
    mocks.getPublishedLibraryEntry.mockResolvedValueOnce({
      ok: false,
      kind: "not-found",
      message: "Library entry was not found.",
    });

    const response = await getEntry(
      new Request("https://example.com/api/agent/public/v1/library/missing"),
      context("missing"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      kind: "not-found",
      error: "Library entry was not found.",
    });
  });
});
