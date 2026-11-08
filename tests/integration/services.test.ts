/**
 * Database-backed service tests. Uses an embedded PostgreSQL locally or the
 * CI-provided DATABASE_URL. Exercises persistence, generation (mock provider),
 * Review Mode and version history end to end without the UI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, type TestDatabase } from "../helpers/embedded-db";
import { sampleProfile } from "../fixtures/profiles";

let db: TestDatabase;
let ownerId: string;

type Services = {
  profile: typeof import("@/features/career-profile/service");
  jobs: typeof import("@/features/job-analysis/service");
  tailoring: typeof import("@/features/resume-tailoring/service");
  history: typeof import("@/features/resume-history/service");
  settings: typeof import("@/features/ai-settings/service");
  prisma: (typeof import("@/server/database/client"))["prisma"];
};
let s: Services;

const JOB_TEXT = `Senior Frontend Engineer
We are hiring a Senior Frontend Engineer.
Required: 5+ years React and TypeScript, GraphQL APIs, mentoring junior engineers.
Required: Kubernetes deployment experience.
Nice to have: Java.`;

beforeAll(async () => {
  db = await startTestDatabase();
  process.env.DATABASE_URL = db.url;
  process.env.AI_ENABLE_MOCK_PROVIDER = "true";
  s = {
    profile: await import("@/features/career-profile/service"),
    jobs: await import("@/features/job-analysis/service"),
    tailoring: await import("@/features/resume-tailoring/service"),
    history: await import("@/features/resume-history/service"),
    settings: await import("@/features/ai-settings/service"),
    prisma: (await import("@/server/database/client")).prisma,
  };
  await s.prisma.user.deleteMany();
  const user = await s.prisma.user.create({ data: { email: "owner@example.com", passwordHash: "x" } });
  ownerId = user.id;
}, 180_000);

afterAll(async () => {
  await s?.prisma.$disconnect();
  await db?.stop();
});

describe("career profile persistence (FR-002)", () => {
  it("creates immutable revisions and tracks confirmation", async () => {
    const empty = await s.profile.getProfileSnapshot(ownerId);
    expect(empty.revisionId).toBeNull();

    const draft = await s.profile.saveProfileRevision(ownerId, sampleProfile(), { confirmed: false });
    expect(draft.version).toBe(1);
    expect(draft.confirmedAt).toBeNull();

    const confirmed = await s.profile.saveProfileRevision(ownerId, sampleProfile(), { confirmed: true });
    expect(confirmed.version).toBe(2);
    expect(confirmed.confirmedAt).not.toBeNull();

    const revisions = await s.profile.listProfileRevisions(ownerId);
    expect(revisions.map((revision) => revision.version)).toEqual([2, 1]);
    const first = await s.profile.getProfileRevision(ownerId, draft.revisionId!);
    expect(first.data.personal.fullName).toBe("Alex Rivera");
  });

  it("rejects invalid profile data", async () => {
    await expect(
      s.profile.saveProfileRevision(ownerId, { personal: { fullName: "" } }, { confirmed: true }),
    ).rejects.toThrow(/Full name/);
  });
});

describe("AI settings (FR-011)", () => {
  it("stores a default provider without secrets and resolves selections", async () => {
    await s.settings.saveProviderSetting(ownerId, {
      providerId: "mock",
      modelId: "mock-deterministic-v1",
      makeDefault: true,
    });
    const view = await s.settings.getAISettings(ownerId);
    expect(view.defaultProviderId).toBe("mock");
    expect(view.settings[0].configuration).toEqual({});
    const selection = await s.settings.resolveProviderSelection(ownerId);
    expect(selection).toEqual({ providerId: "mock", modelId: "mock-deterministic-v1", paid: false });
    await expect(s.settings.resolveProviderSelection(ownerId, { providerId: "openai" })).rejects.toThrow(
      /not configured|No model/,
    );
  });
});

describe("job descriptions and analysis (FR-003)", () => {
  it("creates, analyses and invalidates analysis on text change", async () => {
    const job = await s.jobs.createJobDescription(ownerId, {
      originalText: JOB_TEXT,
      title: "",
      company: "Globex",
      location: "",
      sourceUrl: "",
      notes: "",
    });
    expect(job.analysis).toBeNull();
    const analysed = await s.jobs.analyzeJobDescription(ownerId, job.id);
    expect(analysed.analysis?.requirements.length).toBeGreaterThan(2);
    expect(analysed.analysis?.requirements.every((requirement) => requirement.id.startsWith("req_"))).toBe(true);
    expect(analysed.analysisProviderId).toBe("mock");
    const updated = await s.jobs.updateJobDescription(ownerId, job.id, {
      originalText: `${JOB_TEXT}\nUpdated.`,
      title: "",
      company: "Globex",
      location: "",
      sourceUrl: "",
      notes: "",
    });
    expect(updated.analysis).toBeNull();
    await s.jobs.deleteJobDescription(ownerId, job.id);
    await expect(s.jobs.getJobDescription(ownerId, job.id)).rejects.toThrow(/not found/i);
  });
});

describe("generation, review and history (FR-004, FR-005, FR-006, FR-010)", () => {
  let jobId: string;
  let resumeId: string;

  it("quick generate saves a validated resume version with traceability", async () => {
    const job = await s.jobs.createJobDescription(ownerId, {
      originalText: JOB_TEXT,
      title: "Senior Frontend Engineer",
      company: "Globex",
      location: "",
      sourceUrl: "",
      notes: "",
    });
    jobId = job.id;
    const result = await s.tailoring.generateResume(ownerId, {
      jobDescriptionId: jobId,
      mode: "quick",
      templateId: "jake-inspired",
      pageFormat: "Letter",
    });
    expect(result.kind).toBe("quick");
    if (result.kind !== "quick") return;
    resumeId = result.resumeId;
    expect(result.revision.version).toBe(1);
    expect(result.revision.templateId).toBe("jake-inspired");
    expect(result.revision.pageFormat).toBe("Letter");
    expect(["passed", "passed_with_rejections"]).toContain(result.revision.validationStatus);
    expect(result.revision.generationMetadata?.providerId).toBe("mock");
    expect(result.revision.careerProfileRevisionId).not.toBeNull();
    expect(result.revision.content.skills.some((skill) => skill.name === "Kubernetes")).toBe(false);
    expect(result.revision.changeReport?.missingRequirements.some((line) => /kubernetes/i.test(line))).toBe(true);
    const run = await s.prisma.generationRun.findUnique({ where: { id: result.runId } });
    expect(run?.status).toBe("completed");
    expect(run?.resultResumeId).toBe(resumeId);
  });

  it("refuses to generate from an unconfirmed profile", async () => {
    await s.profile.saveProfileRevision(ownerId, sampleProfile(), { confirmed: false });
    await expect(s.tailoring.generateResume(ownerId, { jobDescriptionId: jobId, mode: "quick" })).rejects.toThrow(
      /Confirm your Master Career Profile/,
    );
    await s.profile.saveProfileRevision(ownerId, sampleProfile(), { confirmed: true });
  });

  it("review mode stores proposals and finalises accepted decisions", async () => {
    const result = await s.tailoring.generateResume(ownerId, { jobDescriptionId: jobId, mode: "review" });
    expect(result.kind).toBe("review");
    if (result.kind !== "review") return;
    const run = await s.tailoring.getReviewRun(ownerId, result.runId);
    expect(run.status).toBe("awaiting_review");
    const finalized = await s.tailoring.finalizeReview(
      ownerId,
      result.runId,
      run.proposals.map((proposal) => ({ proposalId: proposal.id, decision: "accept" })),
    );
    expect(finalized.revision.generationMetadata?.mode).toBe("review");
    expect(finalized.revision.changeReport?.notes.some((note) => note.includes("Review Mode"))).toBe(true);
    await expect(s.tailoring.finalizeReview(ownerId, result.runId, [])).rejects.toThrow(/already been completed/);
    const profileAfter = await s.profile.getProfileSnapshot(ownerId);
    expect(profileAfter.data).toEqual(sampleProfile());
  });

  it("keeps history immutable and supports restore, duplicate, edit and delete", async () => {
    const before = await s.history.getResume(ownerId, resumeId);
    expect(before.revisions.length).toBe(1);

    const edited = await s.tailoring.saveEditedRevision(ownerId, resumeId, {
      templateId: "engineering-modern",
      pageFormat: "A4",
      content: { ...before.revisions[0].content, summary: { text: "Edited summary", sourceIds: [] } },
    });
    expect(edited.version).toBe(2);
    expect(edited.validationStatus).toBe("user_edited");

    const restored = await s.history.restoreRevision(ownerId, before.revisions[0].id);
    expect(restored.version).toBe(3);
    expect(restored.content.summary.text).toBe(before.revisions[0].content.summary.text);

    const after = await s.history.getResume(ownerId, resumeId);
    expect(after.revisions.map((revision) => revision.version)).toEqual([3, 2, 1]);
    expect(after.revisions[2].content).toEqual(before.revisions[0].content);

    const copy = await s.history.duplicateRevision(ownerId, edited.id);
    expect(copy.resumeId).not.toBe(resumeId);
    expect(copy.revision.version).toBe(1);
    expect(copy.revision.content.summary.text).toBe("Edited summary");

    const list = await s.history.listResumes(ownerId);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.find((item) => item.id === resumeId)?.jobTitle).toBe("Senior Frontend Engineer");

    await s.history.deleteResume(ownerId, copy.resumeId);
    await expect(s.history.getResume(ownerId, copy.resumeId)).rejects.toThrow(/not found/i);
  });

  it("isolates data between owners", async () => {
    const other = await s.prisma.user.create({ data: { email: "other@example.com", passwordHash: "x" } });
    await expect(s.history.getResume(other.id, resumeId)).rejects.toThrow(/not found/i);
    await expect(s.jobs.getJobDescription(other.id, jobId)).rejects.toThrow(/not found/i);
    expect((await s.history.listResumes(other.id)).length).toBe(0);
  });
});
