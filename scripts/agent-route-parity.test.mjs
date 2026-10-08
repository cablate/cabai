import assert from "node:assert/strict";
import test from "node:test";
import { collectRequireAgentMethods, compareRouteParity } from "./agent-route-parity.mjs";

test("parity includes shared API routes that call requireAgent outside /api/agent", () => {
  const implemented = collectRequireAgentMethods([
    {
      apiPath: "/api/upload",
      source: "import { requireAgent } from '@/lib/agent-auth'; export async function POST(request) { await requireAgent(request, 'media:write'); }",
    },
    {
      apiPath: "/api/upload/confirm",
      source: "import { requireAgent } from '@/lib/agent-auth'; export const POST = withApiHandler(async (request) => requireAgent(request, 'media:write'));",
    },
    {
      apiPath: "/api/health",
      source: "export async function GET() { return Response.json({ ok: true }); }",
    },
  ]);

  assert.deepEqual([...implemented].sort(), ["POST /api/upload", "POST /api/upload/confirm"]);
});

test("an Agent-auth route absent from OpenAPI is reported as parity drift", () => {
  const implemented = collectRequireAgentMethods([
    {
      apiPath: "/api/upload/confirm",
      source: "export async function POST(request) { await requireAgent(request, 'media:write'); }",
    },
  ]);

  assert.deepEqual(compareRouteParity(implemented, new Set()), {
    undocumented: ["POST /api/upload/confirm"],
    stale: [],
  });
});
