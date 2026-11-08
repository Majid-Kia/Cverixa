import type { CareerProfileData, ExperienceEntry, ProjectEntry } from "@/features/career-profile/schema";
import type { JobAnalysis } from "@/features/job-analysis/schema";
import { newId } from "@/lib/ids";
import {
  DEFAULT_SECTION_ORDER,
  resumeContentSchema,
  resumeSectionKeySchema,
  type ResumeBullet,
  type ResumeContent,
  type ResumeSectionKey,
} from "@/types/resume-content";
import { missingRequirementSummaries } from "./evidence";
import type { ChangeReport, EvidenceMap, TailoringAiOutput, ValidationStatus } from "./schema";
import { validateClaims } from "./validate-claims";

/** Resume content that mirrors the confirmed profile with no AI changes. */
export function buildBaselineContent(profile: CareerProfileData): ResumeContent {
  return resumeContentSchema.parse({
    personal: profile.personal,
    summary: { text: profile.summary.text, sourceIds: [] },
    sectionOrder: DEFAULT_SECTION_ORDER,
    hiddenSections: [],
    experience: profile.experience.map((entry) => ({
      id: entry.id,
      employer: entry.employer,
      title: entry.title,
      location: entry.location,
      startDate: entry.startDate,
      endDate: entry.endDate,
      technologies: entry.technologies,
      bullets: originalBullets(entry),
    })),
    skills: profile.skills.map((skill) => ({ id: skill.id, name: skill.name, category: skill.category })),
    projects: profile.projects.map((project) => ({
      id: project.id,
      name: project.name,
      role: project.role,
      description: project.description,
      technologies: project.technologies,
      url: project.url,
      repositoryUrl: project.repositoryUrl,
      bullets: project.outcomes.map((outcome) => ({
        id: newId("b"),
        text: outcome.text,
        sourceIds: [outcome.id],
        kind: "original",
      })),
    })),
    education: profile.education,
    certifications: profile.certifications,
    languages: profile.languages,
    additionalSections: profile.additionalSections,
  });
}

function originalBullets(entry: ExperienceEntry): ResumeBullet[] {
  return [
    ...entry.achievements.map((achievement) => ({
      id: newId("b"),
      text: achievement.text,
      sourceIds: [achievement.id],
      kind: "original" as const,
    })),
    ...entry.responsibilities.map((statement) => ({
      id: newId("b"),
      text: statement.text,
      sourceIds: [statement.id],
      kind: "original" as const,
    })),
  ];
}

export interface TailoredBuildResult {
  content: ResumeContent;
  changeReport: ChangeReport;
  validationStatus: ValidationStatus;
}

/**
 * Stages 4-6: turn validated AI output into resume content, validate every
 * claim against confirmed facts and describe what changed.
 */
export function buildTailoredContent(input: {
  profile: CareerProfileData;
  analysis: JobAnalysis;
  evidence: EvidenceMap;
  aiOutput: TailoringAiOutput;
}): TailoredBuildResult {
  const { profile, analysis, evidence, aiOutput } = input;
  const baseline = buildBaselineContent(profile);
  const sourceTexts = collectSourceTexts(profile);

  const selectedExperience = aiOutput.experience.filter((entry) =>
    profile.experience.some((candidate) => candidate.id === entry.id),
  );
  const useAiSelection = selectedExperience.length > 0;
  const experience = profile.experience
    .filter((entry) => !useAiSelection || selectedExperience.some((selected) => selected.id === entry.id))
    .map((entry) => {
      const selected = selectedExperience.find((candidate) => candidate.id === entry.id);
      const bullets =
        selected && selected.bullets.length > 0 ? toBullets(selected.bullets, sourceTexts) : originalBullets(entry);
      return {
        id: entry.id,
        employer: entry.employer,
        title: entry.title,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        technologies: entry.technologies,
        bullets,
      };
    });

  const selectedProjects = aiOutput.projects.filter((entry) =>
    profile.projects.some((candidate) => candidate.id === entry.id),
  );
  const projects = profile.projects
    .filter(
      (project) => aiOutput.projects.length === 0 || selectedProjects.some((selected) => selected.id === project.id),
    )
    .map((project) => {
      const selected = selectedProjects.find((candidate) => candidate.id === project.id);
      return {
        id: project.id,
        name: project.name,
        role: project.role,
        description: project.description,
        technologies: project.technologies,
        url: project.url,
        repositoryUrl: project.repositoryUrl,
        bullets:
          selected && selected.bullets.length > 0 ? toBullets(selected.bullets, sourceTexts) : projectBullets(project),
      };
    });

  const orderedSkillIds = aiOutput.skillIds.filter((id) => profile.skills.some((skill) => skill.id === id));
  const skills = [
    ...orderedSkillIds.map((id) => profile.skills.find((skill) => skill.id === id)!),
    ...profile.skills.filter((skill) => !orderedSkillIds.includes(skill.id)),
  ].map((skill) => ({ id: skill.id, name: skill.name, category: skill.category }));

  const sectionOrder = normalizeSectionOrder(aiOutput.sectionOrder);

  const draft = resumeContentSchema.parse({
    personal: profile.personal,
    summary: { text: aiOutput.summary.text.trim() || profile.summary.text, sourceIds: aiOutput.summary.sourceIds },
    sectionOrder,
    hiddenSections: [],
    experience,
    skills,
    projects,
    education: profile.education,
    certifications: profile.certifications,
    languages: profile.languages,
    additionalSections: profile.additionalSections,
  });

  const validation = validateClaims(profile, analysis, draft);
  const changeReport = buildChangeReport({
    baseline,
    content: validation.content,
    aiOutput,
    evidence,
    rejected: validation.rejected,
  });
  return { content: validation.content, changeReport, validationStatus: validation.status };
}

function projectBullets(project: ProjectEntry): ResumeBullet[] {
  return project.outcomes.map((outcome) => ({
    id: newId("b"),
    text: outcome.text,
    sourceIds: [outcome.id],
    kind: "original" as const,
  }));
}

function toBullets(
  bullets: Array<{ text: string; sourceIds: string[] }>,
  sourceTexts: Map<string, string>,
): ResumeBullet[] {
  return bullets
    .filter((bullet) => bullet.text.trim())
    .map((bullet) => ({
      id: newId("b"),
      text: bullet.text.trim(),
      sourceIds: [...new Set(bullet.sourceIds)],
      kind: classifyBullet(bullet.text, bullet.sourceIds, sourceTexts),
    }));
}

function classifyBullet(text: string, sourceIds: string[], sourceTexts: Map<string, string>): ResumeBullet["kind"] {
  const normalized = normalizeText(text);
  if (sourceIds.some((id) => normalizeText(sourceTexts.get(id) ?? "") === normalized)) return "original";
  return sourceIds.length > 1 ? "composed" : "reworded";
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collectSourceTexts(profile: CareerProfileData): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of profile.experience) {
    for (const statement of entry.responsibilities) map.set(statement.id, statement.text);
    for (const achievement of entry.achievements) map.set(achievement.id, achievement.text);
  }
  for (const project of profile.projects) {
    for (const outcome of project.outcomes) map.set(outcome.id, outcome.text);
  }
  return map;
}

export function normalizeSectionOrder(order: string[]): ResumeSectionKey[] {
  const valid = order.filter((key): key is ResumeSectionKey => resumeSectionKeySchema.safeParse(key).success);
  const unique = [...new Set(valid)];
  for (const key of DEFAULT_SECTION_ORDER) if (!unique.includes(key)) unique.push(key);
  return unique;
}

function buildChangeReport(input: {
  baseline: ResumeContent;
  content: ResumeContent;
  aiOutput: TailoringAiOutput;
  evidence: EvidenceMap;
  rejected: ChangeReport["rejectedClaims"];
}): ChangeReport {
  const { baseline, content, aiOutput, evidence, rejected } = input;
  const allBullets = [...content.experience, ...content.projects].flatMap((entry) => entry.bullets);
  const citedSourceIds = new Set(allBullets.flatMap((bullet) => bullet.sourceIds));
  const removedBullets = [...baseline.experience, ...baseline.projects]
    .filter(
      (entry) =>
        content.experience.some((item) => item.id === entry.id) ||
        content.projects.some((item) => item.id === entry.id),
    )
    .flatMap((entry) => entry.bullets)
    .filter((bullet) => !bullet.sourceIds.some((id) => citedSourceIds.has(id)))
    .map((bullet) => bullet.text);
  const omittedExperience = baseline.experience
    .filter((entry) => !content.experience.some((item) => item.id === entry.id))
    .map((entry) => `${entry.title} at ${entry.employer}`);
  const omittedProjects = baseline.projects
    .filter((entry) => !content.projects.some((item) => item.id === entry.id))
    .map((entry) => entry.name);
  const baselineSkillOrder = baseline.skills.map((skill) => skill.id).join("|");
  const contentSkillOrder = content.skills.map((skill) => skill.id).join("|");
  return {
    summaryChanged: normalizeText(baseline.summary.text) !== normalizeText(content.summary.text),
    rewordedBullets: allBullets.filter((bullet) => bullet.kind === "reworded").length,
    composedBullets: allBullets.filter((bullet) => bullet.kind === "composed").length,
    removedBullets,
    omittedExperience,
    omittedProjects,
    reorderedSkills: baselineSkillOrder !== contentSkillOrder,
    reorderedSections: content.sectionOrder.join("|") !== DEFAULT_SECTION_ORDER.join("|"),
    sectionOrder: content.sectionOrder,
    rejectedClaims: rejected,
    missingRequirements: missingRequirementSummaries(evidence),
    notes: aiOutput.changeNotes.slice(0, 20),
  };
}
