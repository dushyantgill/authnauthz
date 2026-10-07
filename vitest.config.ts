import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 90000,
    setupFiles: ["./tests/env.ts"],
  },
});
