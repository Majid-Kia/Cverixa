import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration. Without DATABASE_URL an embedded PostgreSQL is
 * started by tests/e2e/global-setup.ts; CI provides a Postgres service.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_OWNER_EMAIL = "owner@example.com";
export const E2E_OWNER_PASSWORD = "CorrectHorse42Battery";
export const E2E_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54329/cverixa_test?schema=public";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      DATABASE_URL: E2E_DATABASE_URL,
      SESSION_SECRET: "e2e-session-secret-at-least-32-characters-long",
      APP_URL: E2E_BASE_URL,
      AI_ENABLE_MOCK_PROVIDER: "true",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    },
  },
});
