/**
 * Provision (or reset the password of) the single owner account.
 *
 *   OWNER_EMAIL=you@example.com OWNER_PASSWORD='...' pnpm owner:create
 *
 * There are no default credentials; this script is the only way to create the
 * owner in the MVP (PRD 3.2, NFR-001).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

function validatePassword(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include upper-case, lower-case and numeric characters.";
  }
  return null;
}

async function main() {
  const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? "";
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  if (!email || !email.includes("@")) throw new Error("OWNER_EMAIL must be a valid email address.");
  const passwordProblem = validatePassword(password);
  if (passwordProblem) throw new Error(`OWNER_PASSWORD rejected: ${passwordProblem}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const existingCount = await prisma.user.count();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing && existingCount > 0) {
      throw new Error("An owner account already exists with a different email. The MVP supports a single owner.");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash },
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    console.log(`Owner account ready for ${user.email} (${existing ? "password updated" : "created"}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
