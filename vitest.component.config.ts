import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.component.test.tsx"],
    setupFiles: ["./src/test/component-setup.ts"],
    // Novel's barrel imports react-tweet CSS even when its Tweet extension is
    // unused. Transform these modules so real-editor tests do not ask Node to
    // load CSS directly; do not replace the editor with a mock.
    server: { deps: { inline: ["novel", "react-tweet", /@tiptap\//, "tippy.js"] } },
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
