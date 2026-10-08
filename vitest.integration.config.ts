import path from "node:path";
import { defineConfig } from "vitest/config";
import { loadTestEnvironment } from "./src/test/setup";

// Keep the established precedence: .env.test wins, then .env fills gaps.
loadTestEnvironment();

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only.ts"),
    },
  },
});
