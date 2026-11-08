import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/pdf/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: "test",
      SESSION_SECRET: "test-session-secret-at-least-32-characters-long",
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://cverixa:cverixa@localhost:5432/cverixa_test?schema=public",
      AI_ENABLE_MOCK_PROVIDER: "true",
    },
  },
});
