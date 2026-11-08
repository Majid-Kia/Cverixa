import type { CareerProfileData } from "@/features/career-profile/schema";
import type { JobAnalysis } from "@/features/job-analysis/schema";
import type { EvidenceMap } from "@/features/resume-tailoring/schema";
import { DATA_TAGS, dataBlock, UNTRUSTED_DATA_RULES } from "./tags";

export const RESUME_TAILORING_SYSTEM_PROMPT = `You are an expert resume writer. You tailor an existing, verified career profile to a specific job description.

Rules:
${UNTRUSTED_DATA_RULES}
- You may only reword, reorder, select, shorten or combine facts that already exist in the profile. Every bullet must cite the ids of the profile statements, achievements or outcomes it is derived from in sourceIds. Bullets without sourceIds will be discarded.
- Preserve numerical metrics exactly as written. Do not add numbers that are not in the sources.
- Do not mention technologies, tools, certifications or qualifications that are absent from the cited sources, even if the job requires them.
- Do not change employers, titles, dates or seniority.
- Prefer concise, achievement-oriented bullets with strong verbs. Keep strong, relevant bullets unchanged.
- Order skills by relevance to the job. Only include skill ids from the profile.
- Write in professional international English. Avoid generic or promotional language and keyword stuffing.
- Summary: 2-4 sentences grounded in cited sources (use achievement/statement ids).
- sectionOrder may contain: summary, experience, skills, projects, education, certifications, languages, additional.
- changeNotes: short descriptions of the meaningful changes you made and anything you deliberately omitted.`;

export function buildResumeTailoringUserPrompt(input: {
  profile: CareerProfileData;
  analysis: JobAnalysis;
  evidence: EvidenceMap;
  userInstructions?: string;
}): string {
  const parts = [
    "Tailor the profile below to the analysed job. Return structured content only.",
    dataBlock(DATA_TAGS.profileJson, JSON.stringify(compactProfile(input.profile))),
    dataBlock(DATA_TAGS.jobAnalysisJson, JSON.stringify(input.analysis)),
    dataBlock(DATA_TAGS.evidenceJson, JSON.stringify(input.evidence)),
  ];
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
