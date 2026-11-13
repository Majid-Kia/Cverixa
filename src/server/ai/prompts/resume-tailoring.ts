import type { CareerProfileData } from "@/features/career-profile/schema";
import type { JobAnalysis } from "@/features/job-analysis/schema";
import type { ApplicationPlan } from "@/features/resume-tailoring/application-brief";
import type { EvidenceMap } from "@/features/resume-tailoring/schema";
import { DATA_TAGS, dataBlock, UNTRUSTED_DATA_RULES } from "./tags";

export const RESUME_TAILORING_SYSTEM_PROMPT = `You are an expert resume writer. You tailor an existing, verified career profile to a specific job description.

Rules:
${UNTRUSTED_DATA_RULES}
- Work in two steps and return both. First fill evidencePlan, then write the draft from it.
- evidencePlan.criteria: for each screening criterion in the application plan, list the ids of the profile statements, achievements, outcomes or projects that directly support it. Search every role and project, including older roles and personal projects, not only the most recent one. In gap, say in one sentence what the criterion asks for that the profile does not state; leave it empty when nothing is missing.
- Related experience is not evidence of something more specific. Never treat it as proof of customer or user interviews, observing users, design ownership, usage or adoption tracking, metrics, or AI features. Cite a statement for these only when it says so outright, and never write such a claim in the summary or a bullet unless a cited source states it.
- evidencePlan.featuredProject: the application plan names the project it will bring onto the first page. Repeat its entryId, or, only if another role or project is clearly a closer match to what this role is hired to do, give that entry's id with up to three of its statement ids and a short title taken from those statements. Leave entryId empty when no project fits.
- evidencePlan.question: at most one short, concrete question about a single detail of the featured project that is missing from the profile and would materially strengthen this application (for example "What did you change in the fraud-detection portal after seeing someone use it?"). Leave it empty when nothing material is missing. Never answer it yourself.
- Describe each piece of work once. Do not repeat the same statement in more than one role, project or section; the application moves the featured project's bullets to the first page itself.
- You may only reword, reorder, select, shorten or combine facts that already exist in the profile. Every bullet must cite the ids of the profile statements, achievements or outcomes it is derived from in sourceIds. Bullets without sourceIds will be discarded.
- Preserve numerical metrics exactly as written. Do not add numbers that are not in the sources.
- Do not mention technologies, tools, certifications or qualifications that are absent from the cited sources, even if the job requires them.
- Do not change employers, titles, dates or seniority.
- Treat experience entries as optional edits to existing roles. Copy each role id and each cited statement or achievement id verbatim from that same role. If you cannot cite a valid source, leave the role's original wording to the application.
- Prefer concise, achievement-oriented bullets with strong verbs. Keep strong, relevant bullets unchanged.
- Order skills by relevance to the job. Only include skill ids from the profile.
- Write in professional international English. Avoid generic or promotional language and keyword stuffing.
- Summary: 2-4 sentences grounded in cited sources (use achievement/statement ids). When the featured project supports a screening criterion, name it in one clause and cite its statements; keep the detail for its bullets.
- Do not change the headline. Years of experience, seniority and titles come from the profile only.
- sectionOrder may contain: summary, experience, skills, projects, education, certifications, languages, additional.
- changeNotes: short descriptions of the meaningful changes you made and anything you deliberately omitted.`;

export function buildResumeTailoringUserPrompt(input: {
  profile: CareerProfileData;
  analysis: JobAnalysis;
  evidence: EvidenceMap;
  /** Criteria, evidence and featured project worked out before drafting. */
  plan?: ApplicationPlan;
  userInstructions?: string;
}): string {
  const parts = [
    "Tailor the profile below to the analysed job. Return structured content only.",
    dataBlock(DATA_TAGS.profileJson, JSON.stringify(compactProfile(input.profile))),
    dataBlock(DATA_TAGS.jobAnalysisJson, JSON.stringify(input.analysis)),
    dataBlock(DATA_TAGS.evidenceJson, JSON.stringify(input.evidence)),
  ];
  if (input.plan) {
    parts.push(
      "Application plan prepared by the application (term matching only; improve on it in evidencePlan):",
      dataBlock(
        DATA_TAGS.applicationPlanJson,
        JSON.stringify({
          screeningCriteria: input.plan.criteria.map((criterion) => ({
            requirementId: criterion.requirementId,
            description: criterion.description,
            status: criterion.status,
            evidenceIds: criterion.evidence.map((ref) => ref.id),
            gap: criterion.missing,
          })),
          featuredProject: input.plan.featured
            ? {
                entryId: input.plan.featured.entryId,
                title: input.plan.featured.title,
                sourceIds: input.plan.featured.sourceIds,
                placement: input.plan.featured.placement,
              }
            : null,
        }),
      ),
    );
  }
  if (input.userInstructions?.trim()) {
    parts.push(
      "Optional user instructions (apply only if they do not conflict with the rules):",
      dataBlock(DATA_TAGS.userInstructions, input.userInstructions.trim()),
    );
  }
  return parts.join("\n\n");
}

/** Strip fields the model does not need to keep prompts compact. */
function compactProfile(profile: CareerProfileData) {
  return {
    personal: { fullName: profile.personal.fullName, headline: profile.personal.headline },
    summary: profile.summary,
    experience: profile.experience.map((entry) => ({
      id: entry.id,
      employer: entry.employer,
      title: entry.title,
      startDate: entry.startDate,
      endDate: entry.endDate || "Present",
      responsibilities: entry.responsibilities,
      achievements: entry.achievements.map((achievement) => ({
        id: achievement.id,
        text: achievement.text,
        metrics: achievement.metrics.map((metric) => `${metric.label}: ${metric.value}`),
      })),
      technologies: entry.technologies,
    })),
    skills: profile.skills.map((skill) => ({ id: skill.id, name: skill.name, category: skill.category })),
    projects: profile.projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      role: project.role,
      technologies: project.technologies,
      outcomes: project.outcomes,
    })),
    education: profile.education.map((entry) => ({
      id: entry.id,
      institution: entry.institution,
      degree: entry.degree,
    })),
    certifications: profile.certifications.map((entry) => ({ id: entry.id, name: entry.name })),
  };
}
