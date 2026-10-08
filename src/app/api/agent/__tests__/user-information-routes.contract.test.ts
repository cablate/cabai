import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserToken: vi.fn(),
  listUnreadInformation: vi.fn(),
  getVisibleInformation: vi.fn(),
  acknowledgeInformation: vi.fn(),
}));

vi.mock("@/lib/user-auth", () => ({
  requireUserToken: mocks.requireUserToken,
}));
vi.mock("@/lib/services/user-information-service", () => ({
  listUnreadInformation: mocks.listUnreadInformation,
  getVisibleInformation: mocks.getVisibleInformation,
  acknowledgeInformation: mocks.acknowledgeInformation,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

import { GET as listUnread } from "@/app/api/agent/user/v1/information/route";
import { GET as getInformationDetail } from "@/app/api/agent/user/v1/information/[id]/route";
import { POST as acknowledge } from "@/app/api/agent/user/v1/information/ack/route";

const userAuth = {
  userId: "user-1",
  tokenId: "token-99",
  scopes: ["information:read", "information:ack"],
};

const item = {
  id: "information-1",
  kind: "api.capability-added",
  title: "New Agent endpoint",
  summary: "Agents can retrieve a new resource.",
  whyItMatters: "This avoids scanning unrelated endpoints.",
  bodyMarkdown: "# New Agent endpoint\n\nFull announcement content.",
  publishedAt: new Date("2026-07-17T00:00:00.000Z"),
  expiresAt: null,
  actions: [{
    rel: "api-capability",
    operationId: "getPublicLibraryEntry",
    parameters: {},
    credential: "none" as const,
  }],
  tags: ["agent"],
};

function getRequest(query = "") {
  return new Request(`https://example.com/api/agent/user/v1/information${query}`);
}

function ackRequest(body: unknown) {
  return new Request("https://example.com/api/agent/user/v1/information/ack", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function detailContext(id = item.id) {
  return { params: Promise.resolve({ id }) };
}

describe("User Information Agent route contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserToken.mockResolvedValue(userAuth);
    mocks.listUnreadInformation.mockResolvedValue({
      ok: true,
      value: { items: [item], nextCursor: "next-cursor" },
    });
    mocks.getVisibleInformation.mockResolvedValue({
      ok: true,
      value: item,
    });
    mocks.acknowledgeInformation.mockResolvedValue({
      ok: true,
      value: { acknowledged: [item.id] },
    });
  });

  it("uses the exact read and ACK scopes", async () => {
    await listUnread(getRequest());
    await getInformationDetail(getRequest(), detailContext());
    await acknowledge(ackRequest({ informationIds: [item.id] }));

    expect(mocks.requireUserToken.mock.calls.map((call) => call[1])).toEqual([
      "information:read",
      "information:read",
      "information:ack",
    ]);
  });

  it("passes the stable userId, opaque cursor and bounded limit to the unread service without ACKing", async () => {
    const response = await listUnread(getRequest("?state=unread&cursor=opaque-cursor&limit=42"));

    expect(response.status).toBe(200);
    expect(mocks.listUnreadInformation).toHaveBeenCalledWith({
      userId: "user-1",
      cursor: "opaque-cursor",
      limit: 42,
    });
    expect(mocks.listUnreadInformation).not.toHaveBeenCalledWith(expect.objectContaining({
      tokenId: "token-99",
    }));
    expect(mocks.acknowledgeInformation).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      data: {
        items: [{ ...item, publishedAt: "2026-07-17T00:00:00.000Z" }],
        nextCursor: "next-cursor",
      },
    });
  });

  it("defaults the unread query to a bounded page", async () => {
    await listUnread(getRequest());

    expect(mocks.listUnreadInformation).toHaveBeenCalledWith({
      userId: "user-1",
      cursor: undefined,
      limit: 20,
    });
  });

  it("requests compact summaries additively without changing the unread service defaults", async () => {
    mocks.listUnreadInformation.mockResolvedValueOnce({
      ok: true,
      value: {
        items: [{
          id: item.id,
          kind: item.kind,
          title: item.title,
          summary: item.summary,
          whyItMatters: item.whyItMatters,
          publishedAt: item.publishedAt,
          expiresAt: item.expiresAt,
          tags: item.tags,
        }],
        nextCursor: null,
      },
    });

    const response = await listUnread(getRequest("?include=summary"));

    expect(response.status).toBe(200);
    expect(mocks.listUnreadInformation).toHaveBeenCalledWith({
      userId: "user-1",
      cursor: undefined,
      limit: 20,
      include: "summary",
    });
    const body = await response.json();
    expect(body.data.items[0]).not.toHaveProperty("bodyMarkdown");
    expect(mocks.acknowledgeInformation).not.toHaveBeenCalled();
  });

  it("retrieves a known visible item by id without changing read state", async () => {
    const response = await getInformationDetail(getRequest(), detailContext());

    expect(response.status).toBe(200);
    expect(mocks.getVisibleInformation).toHaveBeenCalledWith({
      userId: "user-1",
      informationId: item.id,
    });
    await expect(response.json()).resolves.toEqual({
      data: { ...item, publishedAt: "2026-07-17T00:00:00.000Z" },
    });
    expect(mocks.acknowledgeInformation).not.toHaveBeenCalled();
  });

  it("preserves canonical visibility failures on detail", async () => {
    mocks.getVisibleInformation.mockResolvedValueOnce({
      ok: false,
      kind: "forbidden",
      message: "Information information-1 is not visible to this user",
    });

    const response = await getInformationDetail(getRequest(), detailContext());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Information information-1 is not visible to this user",
      kind: "forbidden",
    });
  });

  it.each([
    "?state=all",
    "?state=unread&limit=0",
    "?state=unread&limit=101",
    "?state=unread&limit=1.5",
    "?state=unread&include=detail",
    "?state=unread&extra=true",
  ])("rejects an invalid unread query before service dispatch: %s", async (query) => {
    const response = await listUnread(getRequest(query));

    expect(response.status).toBe(400);
    expect(mocks.listUnreadInformation).not.toHaveBeenCalled();
  });

  it("maps a malformed opaque cursor reported by the canonical service to HTTP 400", async () => {
    mocks.listUnreadInformation.mockResolvedValueOnce({
      ok: false,
      kind: "validation-failed",
      message: "Cursor is invalid",
    });

    const response = await listUnread(getRequest("?cursor=not-a-server-cursor"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cursor is invalid",
      kind: "validation-failed",
    });
  });

  it("ACKs a strict batch for the stable userId and returns the canonical result", async () => {
    const response = await acknowledge(ackRequest({
      informationIds: ["information-1", "information-2"],
    }));

    expect(mocks.acknowledgeInformation).toHaveBeenCalledWith({
      userId: "user-1",
      informationIds: ["information-1", "information-2"],
    });
    expect(mocks.acknowledgeInformation).not.toHaveBeenCalledWith(expect.objectContaining({
      tokenId: "token-99",
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { acknowledged: ["information-1"] },
    });
  });

  it.each([
    { informationIds: [] },
    { informationIds: Array.from({ length: 101 }, (_, index) => `information-${index}`) },
    { informationIds: [""] },
    { informationIds: ["information-1"], extra: true },
    { ids: ["information-1"] },
  ])("rejects an invalid strict ACK body before service dispatch", async (body) => {
    const response = await acknowledge(ackRequest(body));

    expect(response.status).toBe(400);
    expect(mocks.acknowledgeInformation).not.toHaveBeenCalled();
  });

  it("rejects malformed ACK JSON before service dispatch", async () => {
    const response = await acknowledge(new Request(
      "https://example.com/api/agent/user/v1/information/ack",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      },
    ));

    expect(response.status).toBe(400);
    expect(mocks.acknowledgeInformation).not.toHaveBeenCalled();
  });

  it("preserves canonical visibility failures on ACK", async () => {
    mocks.acknowledgeInformation.mockResolvedValueOnce({
      ok: false,
      kind: "forbidden",
      message: "Information information-1 is not visible to this user",
    });

    const response = await acknowledge(ackRequest({ informationIds: [item.id] }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      kind: "forbidden",
      error: "Information information-1 is not visible to this user",
    });
  });

  it.each([
    ["GET", 401, "Invalid, revoked, or expired token"],
    ["DETAIL", 401, "Invalid, revoked, or expired token"],
    ["ACK", 403, "Insufficient permissions. Required scope: information:ack"],
  ])("returns a thrown auth response for %s without domain dispatch", async (route, status, error) => {
    mocks.requireUserToken.mockRejectedValueOnce(Response.json({ error }, { status }));

    const response = route === "GET"
      ? await listUnread(getRequest())
      : route === "DETAIL"
        ? await getInformationDetail(getRequest(), detailContext())
        : await acknowledge(ackRequest({ informationIds: [item.id] }));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
    expect(mocks.listUnreadInformation).not.toHaveBeenCalled();
    expect(mocks.getVisibleInformation).not.toHaveBeenCalled();
    expect(mocks.acknowledgeInformation).not.toHaveBeenCalled();
  });
});
