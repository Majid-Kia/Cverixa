/**
 * Database-backed service tests. Uses an embedded PostgreSQL locally or the
 * CI-provided DATABASE_URL. Exercises persistence, generation (mock provider),
 * Review Mode and version history end to end without the UI.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
      configuration: { timeoutMs: 360_000 },
    });
    const view = await s.settings.getAISettings(ownerId);
    expect(view.defaultProviderId).toBe("mock");
    expect(view.settings[0].configuration).toEqual({ timeoutMs: 360_000 });
    const selection = await s.settings.resolveProviderSelection(ownerId);
    expect(selection).toEqual({
      providerId: "mock",
      modelId: "mock-deterministic-v1",
      paid: false,
      timeoutMs: 360_000,
    });
    await expect(s.settings.resolveProviderSelection(ownerId, { providerId: "openai" })).rejects.toThrow(
      /not configured|No model/,
    );
  });
});

describe("job descriptions and analysis (FR-003)", () => {
  it("creates, analyses and invalidates analysis on text change", async () => {
    const { getProvider } = await import("@/server/ai/registry");
    using generateStructured = vi.spyOn(getProvider("mock"), "generateStructured");
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
    expect(generateStructured).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 360_000 }));
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

describe("application brief, selected project and question (Review Mode)", () => {
  const PORTAL = "Built the fraud-detection portal that analysts use";

  async function review(posting: { company: string; title: string; text: string }) {
    const job = await s.jobs.createJobDescription(ownerId, {
      originalText: posting.text,
      title: posting.title,
      company: posting.company,
      location: "",
      sourceUrl: "",
      notes: "",
    });
    const result = await s.tailoring.generateResume(ownerId, { jobDescriptionId: job.id, mode: "review" });
    if (result.kind !== "review") throw new Error("expected a review run");
    return { job, result, run: await s.tailoring.getReviewRun(ownerId, result.runId) };
  }

  it("stores the brief with the review run for each reviewed application", async () => {
    const { PARTLY, POLARSTEPS, SEAMFLOW, candidateProfile } = await import("../fixtures/application-cases");
    await s.profile.saveProfileRevision(ownerId, candidateProfile(), { confirmed: true });

    const partly = await review(PARTLY);
    expect(partly.run.brief?.featured).toEqual(
      expect.objectContaining({ title: "Fraud-detection portal", placement: "selected_project" }),
    );
    expect(partly.run.brief?.question?.signal).toBe("customer_contact");
    expect(partly.run.brief?.eligibility.status).toBe("unknown");
    expect(partly.run.proposals.map((proposal) => proposal.kind)).toContain("featured_project");

    const polarsteps = await review(POLARSTEPS);
    expect(polarsteps.run.brief?.featured?.title).toBe("Tour-booking system");
    expect(polarsteps.run.brief?.question).toBeNull();
    // Proceeding without any answer is always possible.
    const plain = await s.tailoring.finalizeReview(
      ownerId,
      polarsteps.result.runId,
      polarsteps.run.proposals.map((proposal) => ({ proposalId: proposal.id, decision: "accept" })),
    );
    expect(plain.revision.content.featured?.subtitle).toBe("Frontend Developer, Zoomit");
    expect(plain.revision.changeReport?.brief?.featured?.title).toBe("Tour-booking system");

    const seamflow = await review(SEAMFLOW);
    expect(seamflow.run.brief?.applicationRequirements.map((item) => item.kind)).toEqual(["project_note"]);
    expect(seamflow.run.brief?.question?.text).toMatch(/design decisions in the fraud-detection portal/);
  });

  it("finalises without an answer and leaves the profile untouched", async () => {
    const { PARTLY } = await import("../fixtures/application-cases");
    const before = await s.profile.getProfileSnapshot(ownerId);
    const { result, run } = await review(PARTLY);
    const finalized = await s.tailoring.finalizeReview(
      ownerId,
      result.runId,
      run.proposals.map((proposal) => ({ proposalId: proposal.id, decision: "accept" })),
      { text: "", saveToProfile: true },
    );
    const texts = [
      ...(finalized.revision.content.featured?.bullets ?? []),
      ...finalized.revision.content.experience.flatMap((entry) => entry.bullets),
    ].map((bullet) => bullet.text);
    expect(texts.filter((text) => text.startsWith(PORTAL))).toHaveLength(1);
    expect(finalized.revision.changeReport?.brief?.question?.signal).toBe("customer_contact");
    expect((await s.profile.getProfileSnapshot(ownerId)).revisionId).toBe(before.revisionId);
  });

  it("adds an answer to the project in the owner's words and saves it to the profile only on request", async () => {
    const { PARTLY } = await import("../fixtures/application-cases");
    const answer = "Sat with two fraud analysts every week during rollout and reordered the queue after watching them.";
    const before = await s.profile.getProfileSnapshot(ownerId);

    const first = await review(PARTLY);
    const resumeOnly = await s.tailoring.finalizeReview(
      ownerId,
      first.result.runId,
      first.run.proposals.map((proposal) => ({ proposalId: proposal.id, decision: "accept" })),
      { text: answer, saveToProfile: false },
    );
    expect(resumeOnly.revision.content.featured?.bullets.at(-1)).toEqual(
      expect.objectContaining({ text: answer, kind: "user_provided", sourceIds: [] }),
    );
    expect(resumeOnly.revision.changeReport?.brief?.question).toBeNull();
    expect(resumeOnly.revision.changeReport?.notes.some((note) => /in your own words/.test(note))).toBe(true);
    expect((await s.profile.getProfileSnapshot(ownerId)).revisionId).toBe(before.revisionId);

    const second = await review(PARTLY);
    const saved = await s.tailoring.finalizeReview(
      ownerId,
      second.result.runId,
      second.run.proposals.map((proposal) => ({ proposalId: proposal.id, decision: "accept" })),
      { text: answer, saveToProfile: true },
    );
    const after = await s.profile.getProfileSnapshot(ownerId);
    expect(after.version).toBe(before.version + 1);
    expect(after.confirmedAt).not.toBeNull();
    const ledgerline = after.data.experience.find((entry) => entry.id === "exp_ledgerline")!;
    expect(ledgerline.achievements.at(-1)?.text).toBe(answer);
    expect(saved.revision.content.featured?.bullets.at(-1)?.sourceIds).toEqual([ledgerline.achievements.at(-1)!.id]);
    expect(saved.revision.careerProfileRevisionId).toBe(after.revisionId);

    // With the statement confirmed, the gap closes and the question is no longer about customer contact.
    const third = await review(PARTLY);
    const customers = third.run.brief?.criteria.find((item) => /directly with customers/.test(item.description));
    expect(customers?.missingSignals).not.toContain("customer_contact");
    expect(customers?.evidence.some((ref) => ref.source.startsWith("Frontend Engineer at Ledgerline"))).toBe(true);
    expect(third.run.brief?.question?.signal).not.toBe("customer_contact");
  });
});

describe("manual application tracking", () => {
  it("defaults to pending, saves per resume and survives new versions", async () => {
    const before = await s.history.listResumes(ownerId);
    expect(before.length).toBeGreaterThanOrEqual(3);
    expect(before.every((resume) => resume.applicationStatus === "pending")).toBe(true);
    const [first, second, third] = before;

    expect(await s.history.setApplicationStatus(ownerId, first.id, "interview")).toBe("interview");
    expect(await s.history.setApplicationStatus(ownerId, third.id, "rejected")).toBe("rejected");

    const after = await s.history.listResumes(ownerId);
    const statusOf = (id: string) => after.find((resume) => resume.id === id)?.applicationStatus;
    expect(statusOf(first.id)).toBe("interview");
    expect(statusOf(second.id)).toBe("pending");
    expect(statusOf(third.id)).toBe("rejected");
    // Every other resume is untouched, and tracking does not count as an edit or reorder the list.
    expect(after.filter((resume) => resume.applicationStatus === "pending")).toHaveLength(before.length - 2);
    expect(after.map((resume) => resume.id)).toEqual(before.map((resume) => resume.id));
    expect(after.find((resume) => resume.id === first.id)?.updatedAt).toEqual(first.updatedAt);

    // The status belongs to the resume: adding, restoring or opening versions keeps it.
    const resume = await s.history.getResume(ownerId, first.id);
    const edited = await s.tailoring.saveEditedRevision(ownerId, first.id, {
      templateId: "engineering-modern",
      pageFormat: "A4",
      content: resume.revisions[0].content,
    });
    await s.history.restoreRevision(ownerId, resume.revisions[0].id);
    const reopened = await s.history.getResume(ownerId, first.id);
    expect(reopened.revisions.length).toBe(resume.revisions.length + 2);
    expect(reopened.revisions.some((revision) => revision.id === edited.id)).toBe(true);
    expect(reopened.applicationStatus).toBe("interview");
    expect((await s.history.listResumes(ownerId)).find((item) => item.id === first.id)?.applicationStatus).toBe(
      "interview",
    );

    // A duplicate is a new resume and starts as pending.
    const copy = await s.history.duplicateRevision(ownerId, edited.id);
    expect((await s.history.getResume(ownerId, copy.resumeId)).applicationStatus).toBe("pending");
    await s.history.deleteResume(ownerId, copy.resumeId);
  });

  it("rejects unknown statuses and other owners, leaving the saved status in place", async () => {
    const [first] = await s.history.listResumes(ownerId);
    const saved = (await s.history.getResume(ownerId, first.id)).applicationStatus;
    await expect(s.history.setApplicationStatus(ownerId, first.id, "offer")).rejects.toThrow(
      /Pending, Interview or Rejected/,
    );
    const other = await s.prisma.user.findUniqueOrThrow({ where: { email: "other@example.com" } });
    await expect(s.history.setApplicationStatus(other.id, first.id, "rejected")).rejects.toThrow(/not found/i);
    await expect(s.history.setApplicationStatus(ownerId, "missing", "rejected")).rejects.toThrow(/not found/i);
    expect((await s.history.getResume(ownerId, first.id)).applicationStatus).toBe(saved);
  });
});
