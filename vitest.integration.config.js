import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/integration/**/*.integration.test.js",
      "tests/integration/sessionCacheOutbox.integration.test.js"
    ],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false
  }
});
