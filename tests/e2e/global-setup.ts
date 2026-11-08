import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "../../playwright.config";
import { createOwner, startTestDatabase } from "../helpers/embedded-db";

/** Provision the database and owner account; returns the teardown that stops the embedded DB. */
export default async function globalSetup() {
  if (process.env.CI && !process.env.DATABASE_URL) {
    throw new Error("CI must provide DATABASE_URL for e2e tests.");
  }
  const db = await startTestDatabase();
  createOwner(db.url, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD);
  return async () => {
    await db.stop();
  };
}
