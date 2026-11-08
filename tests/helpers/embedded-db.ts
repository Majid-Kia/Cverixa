/**
 * Starts a throwaway PostgreSQL instance for local integration/e2e runs when no
 * external DATABASE_URL is provided. CI supplies a real Postgres service.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TestDatabase {
  url: string;
  stop(): Promise<void>;
}

export const EMBEDDED_PORT = 54329;
export const EMBEDDED_URL = `postgresql://postgres:postgres@127.0.0.1:${EMBEDDED_PORT}/cverixa_test?schema=public`;

export async function startTestDatabase(): Promise<TestDatabase> {
  const external = process.env.DATABASE_URL_TEST ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
  if (external) {
    migrate(external);
    return { url: external, stop: async () => undefined };
  }
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const databaseDir = mkdtempSync(path.join(tmpdir(), "cverixa-pg-"));
  const pg = new EmbeddedPostgres({
    databaseDir,
    port: EMBEDDED_PORT,
    user: "postgres",
    password: "postgres",
    persistent: false,
    autoRehydrateSymlinks: true,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("cverixa_test");
  migrate(EMBEDDED_URL);
  return {
    url: EMBEDDED_URL,
    stop: async () => {
      await pg.stop().catch(() => undefined);
      rmSync(databaseDir, { recursive: true, force: true });
    },
  };
}

export function migrate(url: string) {
  execSync("pnpm exec prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}

export function createOwner(url: string, email: string, password: string) {
  execSync("pnpm exec tsx scripts/create-owner.ts", {
    env: { ...process.env, DATABASE_URL: url, OWNER_EMAIL: email, OWNER_PASSWORD: password },
    stdio: "pipe",
  });
}
