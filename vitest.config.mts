import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    environment: "node",
    pool: "threads",
    maxWorkers: 1,
    minWorkers: 1,
  },
});
