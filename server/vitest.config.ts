import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Tests hit the local Docker Postgres; they TRUNCATE tables, so run
    // the suite against the dev database only.
    fileParallelism: false,
  },
});
