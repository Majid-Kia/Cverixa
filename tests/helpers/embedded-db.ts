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

export interface TestDatabaseOptions {
  /**
   * A database of its own for one test file. Test files run in parallel, and a
   * file that resets tables must not share a database with another one. With
   * an external server the database is created next to the configured one;
   * with the embedded server a separate instance is started on `port`.
   */
  isolated?: { name: string; port: number };
}

export async function startTestDatabase(options: TestDatabaseOptions = {}): Promise<TestDatabase> {
  const external = process.env.DATABASE_URL_TEST ?? (process.env.CI ? process.env.DATABASE_URL : undefined);
  const isolated = options.isolated;
  if (external) {
    if (!isolated) {
      migrate(external);
      return { url: external, stop: async () => undefined };
    }
    const url = new URL(external);
    url.pathname = `/${isolated.name}`;
    const { Client } = await import("pg");
    const admin = new Client({ connectionString: external });
    await admin.connect();
    try {
      const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [isolated.name]);
      if (existing.rowCount === 0) await admin.query(`CREATE DATABASE "${isolated.name.replace(/"/g, "")}"`);
    } finally {
      await admin.end();
    }
    migrate(url.toString());
    return { url: url.toString(), stop: async () => undefined };
  }
  const port = isolated?.port ?? EMBEDDED_PORT;
  const name = isolated?.name ?? "cverixa_test";
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/${name}?schema=public`;
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const databaseDir = mkdtempSync(path.join(tmpdir(), "cverixa-pg-"));
  const pg = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: false,
    autoRehydrateSymlinks: true,
    onLog: () => undefined,
    onError: () => undefined,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(name);
  migrate(url);
  return {
    url,
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

/** Store the synthetic candidate profile (tests/fixtures/application-cases.ts) as the owner's confirmed profile. */
export function seedCandidateProfile(url: string, email: string) {
  execSync("pnpm exec tsx tests/e2e/seed-candidate-profile.ts", {
    env: { ...process.env, DATABASE_URL: url, OWNER_EMAIL: email },
    stdio: "pipe",
  });
}
