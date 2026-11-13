import type { CareerProfileData } from "@/features/career-profile/schema";
import { jobAnalysisAiOutputSchema, jobAnalysisSchema, type JobAnalysis } from "@/features/job-analysis/schema";
import { planApplication, reconcilePlan, toBrief } from "@/features/resume-tailoring/application-brief";
import { buildTailoredContent } from "@/features/resume-tailoring/build-content";
import { tailoringAiOutputSchema } from "@/features/resume-tailoring/schema";
import { mockJobAnalysis, mockTailoring } from "@/server/ai/providers/mock";
import type { ResumeContent } from "@/types/resume-content";

/** Job analysis as the mock provider produces it, with stable ids. */
export function analyse(text: string): JobAnalysis {
  const raw = jobAnalysisAiOutputSchema.parse(mockJobAnalysis(text));
  return jobAnalysisSchema.parse({
    ...raw,
    requirements: raw.requirements.map((requirement, index) => ({ ...requirement, id: `req_${index}` })),
  });
}

/**
 * Run the planning and drafting stages the way `generateResume` does, with the
 * mock model. `modelOutput` overrides parts of the model's answer to simulate
 * a real provider (including one that misbehaves).
 */
export function tailor(profile: CareerProfileData, jobText: string, modelOutput?: Record<string, unknown>) {
  const analysis = analyse(jobText);
  const initial = planApplication({ profile, analysis, jobText });
  const aiOutput = tailoringAiOutputSchema.parse({ ...mockTailoring(profile, analysis), ...modelOutput });
  const plan = reconcilePlan(initial, aiOutput.evidencePlan, profile, analysis);
  const brief = toBrief(plan);
  const built = buildTailoredContent({
    profile,
    analysis,
    evidence: plan.evidence,
    aiOutput,
    featured: plan.featured,
    brief,
  });
  return { analysis, initial, plan, brief, built };
}

/** Text of every bullet on the resume, selected project first. */
export function allBulletTexts(content: ResumeContent): string[] {
  return [
    ...(content.featured?.bullets ?? []),
    ...content.experience.flatMap((entry) => entry.bullets),
    ...content.projects.flatMap((project) => project.bullets),
  ].map((bullet) => bullet.text);
}
