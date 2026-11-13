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
import type {
  ApplicationBrief,
  ChangeReport,
  EvidenceMap,
  FeaturedSelection,
  TailoringAiOutput,
  ValidationStatus,
} from "./schema";
import { validateClaims } from "./validate-claims";

/** Resume content that mirrors the confirmed profile with no AI changes. */
export function buildBaselineContent(profile: CareerProfileData): ResumeContent {
  return resumeContentSchema.parse({
    personal: profile.personal,
    summary: { text: profile.summary.text, sourceIds: [] },
    sectionOrder: DEFAULT_SECTION_ORDER,
    hiddenSections: [],
    featured: null,
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
 * claim against confirmed facts, bring the selected project onto the first
 * page and describe what changed.
 */
export function buildTailoredContent(input: {
  profile: CareerProfileData;
  analysis: JobAnalysis;
  evidence: EvidenceMap;
  aiOutput: TailoringAiOutput;
  /** Project chosen before drafting; omitted for plain tailoring. */
  featured?: FeaturedSelection | null;
  brief?: ApplicationBrief | null;
}): TailoredBuildResult {
  const { profile, analysis, evidence, aiOutput } = input;
  const baseline = buildBaselineContent(profile);
  const sourceTexts = collectSourceTexts(profile);

  const experience = baseline.experience.map((entry) => {
    const selected = aiOutput.experience.find((candidate) => candidate.id === entry.id);
    const bullets = toBullets(selected?.bullets ?? [], sourceTexts);
    return bullets.length ? { ...entry, bullets } : entry;
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
  const seenSkillNames = new Set<string>();
  const skills = [
    ...orderedSkillIds.map((id) => profile.skills.find((skill) => skill.id === id)!),
    ...profile.skills.filter((skill) => !orderedSkillIds.includes(skill.id)),
  ]
    // The same skill confirmed twice (for example under two categories) is listed once.
    .filter((skill) => {
      const key = normalizeText(skill.name);
      if (seenSkillNames.has(key)) return false;
      seenSkillNames.add(key);
      return true;
    })
    .map((skill) => ({ id: skill.id, name: skill.name, category: skill.category }));

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
  const validated = {
    ...validation.content,
    experience: preserveExperience(baseline.experience, validation.content.experience),
  };
  const content = dedupeAcrossSections(applyFeatured(validated, baseline, input.featured ?? null));
  const changeReport = buildChangeReport({
    baseline,
    content,
    notes: aiOutput.changeNotes,
    evidence,
    rejected: validation.rejected,
    brief: input.brief ?? null,
  });
  const validationStatus =
    validation.status === "failed" && content.experience.some((entry) => entry.bullets.length)
      ? "passed_with_rejections"
      : validation.status;
  return { content, changeReport, validationStatus };
}

/**
 * Keep confirmed roles and use their original bullets when no rewrite survived
 * validation. A role whose bullets were moved to the selected project keeps
 * its place in the chronology even when nothing else is left under it.
 */
export function preserveExperience(
  baseline: ResumeContent["experience"],
  tailored: ResumeContent["experience"],
  featured: ResumeContent["featured"] = null,
): ResumeContent["experience"] {
  return baseline.map((entry) => {
    const proposed = tailored.find((candidate) => candidate.id === entry.id);
    const movedOut = featured?.entryKind === "experience" && featured.entryId === entry.id;
    return proposed && (proposed.bullets.length || movedOut) ? proposed : entry;
  });
}

const MAX_FEATURED_BULLETS = 3;

/**
 * Bring the selected project onto the first page without repeating it.
 *
 * - A profile project moves, whole, from Projects to a short entry under the summary.
 * - Work from an older role gets the same short entry: its bullets are moved
 *   out of the role (which stays where it is in the chronology) and the entry
 *   names the role, employer and dates it comes from.
 * - Work from the most recent role is already at the top of page one; its
 *   bullets are only kept within the first three of that role.
 *
 * When the model dropped the project's statements, the original confirmed
 * wording is used instead.
 */
export function applyFeatured(
  content: ResumeContent,
  baseline: ResumeContent,
  selection: FeaturedSelection | null,
): ResumeContent {
  if (!selection) return { ...content, featured: null };
  const cited = new Set(selection.sourceIds);
  const touches = (bullet: ResumeBullet) => bullet.sourceIds.some((id) => cited.has(id));

  if (selection.entryKind === "project") {
    const original = baseline.projects.find((project) => project.id === selection.entryId);
    const project = content.projects.find((candidate) => candidate.id === selection.entryId) ?? original;
    if (!project) return { ...content, featured: null };
    const source = project.bullets.length ? project.bullets : (original?.bullets ?? []);
    const bullets = source.slice(0, MAX_FEATURED_BULLETS + 1);
    if (bullets.length === 0 && !project.description) return { ...content, featured: null };
    return {
      ...content,
      featured: {
        entryId: project.id,
        entryKind: "project",
        title: project.name,
        subtitle: project.role,
        startDate: "",
        endDate: "",
        description: project.description,
        technologies: project.technologies,
        bullets,
      },
      projects: content.projects.filter((candidate) => candidate.id !== project.id),
    };
  }

  const role = content.experience.find((entry) => entry.id === selection.entryId);
  if (!role) return { ...content, featured: null };
  const originals = baseline.experience.find((entry) => entry.id === role.id)?.bullets.filter(touches) ?? [];

  if (selection.placement === "lead_role") {
    const present = role.bullets.filter(touches);
    let bullets = role.bullets;
    if (present.length === 0) bullets = [...originals, ...role.bullets];
    else if (!role.bullets.slice(0, 3).some(touches)) {
      bullets = [...present, ...role.bullets.filter((bullet) => !touches(bullet))];
    }
    return {
      ...content,
      featured: null,
      experience: content.experience.map((entry) => (entry.id === role.id ? { ...entry, bullets } : entry)),
    };
  }

  const tailored = role.bullets.filter(touches);
  const moved = (tailored.length ? tailored : originals).slice(0, MAX_FEATURED_BULLETS);
  if (moved.length === 0) return { ...content, featured: null };
  const movedIds = new Set(moved.map((bullet) => bullet.id));
  const movedSources = new Set(moved.flatMap((bullet) => bullet.sourceIds));
  const remaining = role.bullets.filter(
    (bullet) =>
      !movedIds.has(bullet.id) &&
      !(bullet.sourceIds.length > 0 && bullet.sourceIds.every((id) => movedSources.has(id))),
  );
  return {
    ...content,
    featured: {
      entryId: role.id,
      entryKind: "experience",
      title: selection.title,
      subtitle: `${role.title}, ${role.employer}`,
      startDate: role.startDate,
      endDate: role.endDate,
      description: "",
      technologies: [],
      bullets: moved,
    },
    experience: content.experience.map((entry) => (entry.id === role.id ? { ...entry, bullets: remaining } : entry)),
  };
}

/**
 * One description per piece of work: a bullet already shown in the selected
 * project is not repeated under a role or project, and a bullet shown under a
 * role is not repeated in Projects.
 */
export function dedupeAcrossSections(content: ResumeContent): ResumeContent {
  const seen = new Set((content.featured?.bullets ?? []).map((bullet) => normalizeText(bullet.text)));
  const experience = content.experience.map((entry) => ({
    ...entry,
    bullets: entry.bullets.filter((bullet) => !seen.has(normalizeText(bullet.text))),
  }));
  for (const entry of experience) for (const bullet of entry.bullets) seen.add(normalizeText(bullet.text));
  const projects = content.projects.map((project) => ({
    ...project,
    bullets: project.bullets.filter((bullet) => !seen.has(normalizeText(bullet.text))),
  }));
  return { ...content, experience, projects };
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

/** Valid, complete section order. The selected project always sits directly under the summary. */
export function normalizeSectionOrder(order: string[]): ResumeSectionKey[] {
  const valid = order.filter((key): key is ResumeSectionKey => resumeSectionKeySchema.safeParse(key).success);
  const unique: ResumeSectionKey[] = [...new Set(valid)].filter((key) => key !== "featured");
  for (const key of DEFAULT_SECTION_ORDER) if (key !== "featured" && !unique.includes(key)) unique.push(key);
  unique.splice(unique.indexOf("summary") + 1, 0, "featured");
  return unique;
}

export function buildChangeReport(input: {
  baseline: ResumeContent;
  content: ResumeContent;
  notes: string[];
  evidence: EvidenceMap;
  rejected: ChangeReport["rejectedClaims"];
  brief?: ApplicationBrief | null;
}): ChangeReport {
  const { baseline, content, notes, evidence, rejected } = input;
  const featured = content.featured;
  const allBullets = [
    ...(featured?.bullets ?? []),
    ...[...content.experience, ...content.projects].flatMap((entry) => entry.bullets),
  ];
  const citedSourceIds = new Set(allBullets.flatMap((bullet) => bullet.sourceIds));
  const removedBullets = [...baseline.experience, ...baseline.projects]
    .filter(
      (entry) =>
        content.experience.some((item) => item.id === entry.id) ||
        content.projects.some((item) => item.id === entry.id) ||
        featured?.entryId === entry.id,
    )
    .flatMap((entry) => entry.bullets)
    .filter((bullet) => !bullet.sourceIds.some((id) => citedSourceIds.has(id)))
    .map((bullet) => bullet.text);
  const omittedExperience = baseline.experience
    .filter((entry) => !content.experience.some((item) => item.id === entry.id))
    .map((entry) => `${entry.title} at ${entry.employer}`);
  const omittedProjects = baseline.projects
    .filter((entry) => !content.projects.some((item) => item.id === entry.id) && featured?.entryId !== entry.id)
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
    notes: notes.slice(0, 20),
    brief: input.brief ?? null,
  };
}
