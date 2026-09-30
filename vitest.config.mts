import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // lib/db/* import "server-only", which throws outside Next's server build.
      "server-only": path.resolve("tests/integration/empty.ts"),
      "@": path.resolve("apps/web"),
      "@loop/core": path.resolve("packages/core/src/index.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/env.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
