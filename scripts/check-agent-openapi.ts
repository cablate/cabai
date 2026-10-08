import { readFile } from "node:fs/promises";
import path from "node:path";
import { serializeAgentOpenApi } from "../src/lib/agent/openapi";

function canonicalText(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

async function main() {
  const artifactPath = path.join(process.cwd(), "docs", "openapi", "agent-v1.json");
  const committed = await readFile(artifactPath, "utf8");
  const generated = serializeAgentOpenApi();
  if (canonicalText(committed) !== canonicalText(generated)) {
    throw new Error("Agent OpenAPI artifact is stale. Run npm run openapi:generate.");
  }
  console.log("Agent OpenAPI artifact is current.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
