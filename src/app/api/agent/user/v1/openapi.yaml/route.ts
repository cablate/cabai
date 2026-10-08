import { serializeUserAgentOpenApiYaml } from "@/lib/agent/openapi";

export const dynamic = "force-static";

export function GET() {
  return new Response(serializeUserAgentOpenApiYaml(), {
    status: 200,
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
