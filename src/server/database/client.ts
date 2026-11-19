import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
  return new PrismaClient({ adapter, log: ["error", "warn"] });
}

/**
 * A client kept from before the schema changed has no accessor for a newly
 * added model (`prisma.coverLetter` is undefined). That happens in development
 * when the client is regenerated while the dev server keeps running.
 */
function isCurrent(client: PrismaClient): boolean {
  return Object.values(Prisma.ModelName).every(
    (model) => `${model.charAt(0).toLowerCase()}${model.slice(1)}` in client,
  );
}

function reuseOrCreate(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && isCurrent(cached)) return cached;
  // Let the outdated client's connections close in the background.
  void cached?.$disconnect().catch(() => undefined);
  return createClient();
}

/** Process-wide Prisma client (reused across hot reloads in development). */
export const prisma: PrismaClient = reuseOrCreate();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
