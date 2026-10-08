import { requireAgent } from "@/lib/agent-auth";
import { serializeAgentOpenApiYaml } from "@/lib/agent/openapi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAgent(request);
    return new Response(serializeAgentOpenApiYaml(), {
      status: 200,
      headers: {
        "Content-Type": "application/yaml; charset=utf-8",
        "Cache-Control": "private, max-age=300, stale-while-revalidate=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load Agent API contract" }, { status: 500 });
  }
}
