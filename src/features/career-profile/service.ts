import "server-only";
import { AppError, NotFoundError } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { prisma } from "@/server/database/client";
import { toJson } from "@/server/database/json";
import { careerProfileDataSchema, emptyProfile, type CareerProfileData } from "./schema";

export interface ProfileSnapshot {
  profileId: string;
  revisionId: string | null;
  version: number;
  confirmedAt: Date | null;
  data: CareerProfileData;
  updatedAt: Date;
}

/** The owner's single Master Career Profile, created lazily. */
export async function getOrCreateProfile(ownerId: string) {
  const existing = await prisma.careerProfile.findFirst({ where: { ownerId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.careerProfile.create({ data: { ownerId, name: "Master Career Profile" } });
}

export async function getProfileSnapshot(ownerId: string): Promise<ProfileSnapshot> {
  const profile = await getOrCreateProfile(ownerId);
  const revision = profile.currentRevisionId
    ? await prisma.careerProfileRevision.findUnique({ where: { id: profile.currentRevisionId } })
    : null;
  const parsed = revision ? careerProfileDataSchema.safeParse(revision.structuredData) : null;
  return {
    profileId: profile.id,
    revisionId: revision?.id ?? null,
    version: revision?.version ?? 0,
    confirmedAt: revision?.confirmedAt ?? null,
    data: parsed?.success ? parsed.data : emptyProfile(),
    updatedAt: revision?.createdAt ?? profile.updatedAt,
  };
}

/** Store a new immutable revision and make it current. */
export async function saveProfileRevision(
  ownerId: string,
  data: unknown,
  options: { confirmed: boolean },
): Promise<ProfileSnapshot> {
  const parsed = careerProfileDataSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AppError(
      "invalid_profile",
      `Profile data is invalid at ${first?.path.join(".") || "root"}: ${first?.message ?? "unknown error"}`,
    );
  }
  if (!parsed.data.personal.fullName.trim()) {
    throw new AppError("invalid_profile", "Full name is required.");
  }
  const profile = await getOrCreateProfile(ownerId);
  const revision = await prisma.$transaction(async (tx) => {
    const latest = await tx.careerProfileRevision.findFirst({
      where: { profileId: profile.id },
      orderBy: { version: "desc" },
    });
    const created = await tx.careerProfileRevision.create({
      data: {
        profileId: profile.id,
        version: (latest?.version ?? 0) + 1,
        structuredData: toJson(parsed.data),
        confirmedAt: options.confirmed ? new Date() : null,
      },
    });
    await tx.careerProfile.update({ where: { id: profile.id }, data: { currentRevisionId: created.id } });
    return created;
  });
  return {
    profileId: profile.id,
    revisionId: revision.id,
    version: revision.version,
    confirmedAt: revision.confirmedAt,
    data: parsed.data,
    updatedAt: revision.createdAt,
  };
}

/**
 * Add one statement, written by the owner, to a confirmed role (as an
 * achievement) or project (as an outcome) and store it as a new confirmed
 * revision. Used when the owner answers a tailoring question and chooses to
 * keep the answer. Returns null when the profile is unconfirmed or the entry
 * no longer exists.
 */
export async function appendProfileFact(
  ownerId: string,
  input: { entryId: string; entryKind: "experience" | "project"; text: string },
): Promise<{ factId: string; revisionId: string; previousRevisionId: string } | null> {
  const snapshot = await getProfileSnapshot(ownerId);
  const text = input.text.replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!snapshot.revisionId || !snapshot.confirmedAt || !text) return null;
  const data = structuredClone(snapshot.data);
  let factId: string;
  if (input.entryKind === "experience") {
    const entry = data.experience.find((item) => item.id === input.entryId && item.status === "confirmed");
    if (!entry) return null;
    factId = newId("ach");
    entry.achievements.push({ id: factId, text, metrics: [] });
  } else {
    const project = data.projects.find((item) => item.id === input.entryId && item.status === "confirmed");
    if (!project) return null;
    factId = newId("out");
    project.outcomes.push({ id: factId, text });
  }
  const saved = await saveProfileRevision(ownerId, data, { confirmed: true });
  if (!saved.revisionId) return null;
  return { factId, revisionId: saved.revisionId, previousRevisionId: snapshot.revisionId };
}

export async function getProfileRevision(
  ownerId: string,
  revisionId: string,
): Promise<{ id: string; data: CareerProfileData }> {
  const revision = await prisma.careerProfileRevision.findFirst({ where: { id: revisionId, profile: { ownerId } } });
  if (!revision) throw new NotFoundError("Profile revision not found.");
  return { id: revision.id, data: careerProfileDataSchema.parse(revision.structuredData) };
}

export async function listProfileRevisions(ownerId: string) {
  const profile = await getOrCreateProfile(ownerId);
  return prisma.careerProfileRevision.findMany({
    where: { profileId: profile.id },
    orderBy: { version: "desc" },
    select: { id: true, version: true, confirmedAt: true, createdAt: true },
    take: 20,
  });
}
