import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` must work without a database (CI, fresh clones), so a
// non-secret local placeholder is used when DATABASE_URL is not set.
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://cverixa:cverixa@localhost:5432/cverixa?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/create-owner.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
