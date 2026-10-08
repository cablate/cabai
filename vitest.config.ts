import { defineConfig } from "vitest/config";
import path from "path";
import { loadTestEnvironment } from "./src/test/setup";

// Load .env.test first (test DB), then .env for other vars
loadTestEnvironment();

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts", "src/**/*.contract.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
