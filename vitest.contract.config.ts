import path from "node:path";
import { defineConfig } from "vitest/config";
import { loadTestEnvironment } from "./src/test/setup";

loadTestEnvironment();

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.contract.test.ts"],
    testTimeout: 10_000,
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
