import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { serializeAgentOpenApi } from "../src/lib/agent/openapi";

async function main() {
  const outputDirectory = path.join(process.cwd(), "docs", "openapi");
  const outputPath = path.join(outputDirectory, "agent-v1.json");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, serializeAgentOpenApi(), "utf8");
  console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
