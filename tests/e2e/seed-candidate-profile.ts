/**
 * Store the synthetic candidate profile as the owner's confirmed Master Career
 * Profile for the application-review end-to-end tests. Typing four roles into
 * the profile editor is already covered by workflow.spec.ts; these tests are
 * about what happens after the profile exists.
 *
 *   DATABASE_URL=... OWNER_EMAIL=... pnpm exec tsx tests/e2e/seed-candidate-profile.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { candidateProfile } from "../fixtures/application-cases";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  if (!databaseUrl || !email) throw new Error("DATABASE_URL and OWNER_EMAIL are required.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const owner = await prisma.user.findUnique({ where: { email } });
    if (!owner) throw new Error(`No owner account for ${email}.`);
    const profile =
      (await prisma.careerProfile.findFirst({ where: { ownerId: owner.id }, orderBy: { createdAt: "asc" } })) ??
      (await prisma.careerProfile.create({ data: { ownerId: owner.id, name: "Master Career Profile" } }));
    const latest = await prisma.careerProfileRevision.findFirst({
      where: { profileId: profile.id },
      orderBy: { version: "desc" },
    });
    const revision = await prisma.careerProfileRevision.create({
      data: {
        profileId: profile.id,
        version: (latest?.version ?? 0) + 1,
        structuredData: JSON.parse(JSON.stringify(candidateProfile())),
        confirmedAt: new Date(),
      },
    });
    await prisma.careerProfile.update({ where: { id: profile.id }, data: { currentRevisionId: revision.id } });
    console.log(`Candidate profile stored as version ${revision.version}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
