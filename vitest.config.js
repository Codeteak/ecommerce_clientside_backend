import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      NODE_ENV: "test"
    }
  }
});
