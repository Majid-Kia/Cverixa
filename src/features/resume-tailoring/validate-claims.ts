import { confirmedFactsOnly, type CareerProfileData } from "@/features/career-profile/schema";
import { containsTerm, normalizeTerm, TECH_KEYWORDS } from "@/features/job-analysis/keywords";
import type { JobAnalysis } from "@/features/job-analysis/schema";
import type { ResumeBullet, ResumeContent } from "@/types/resume-content";
import type { RejectedClaim, ValidationStatus } from "./schema";

export interface SourceFact {
  id: string;
  kind: "responsibility" | "achievement" | "outcome" | "project" | "summary";
  /** Experience or project id this fact belongs to. */
  parentId: string;
  text: string;
}

/** Index of confirmed facts that may be cited as evidence. Unconfirmed entries are ignored. */
export class SourceIndex {
  readonly facts = new Map<string, SourceFact>();
  readonly skillNames: string[];
  readonly technologyTerms: string[];
  readonly profile: CareerProfileData;

  constructor(source: CareerProfileData) {
    const profile = confirmedFactsOnly(source);
    this.profile = profile;
    for (const entry of profile.experience) {
      for (const statement of entry.responsibilities) {
        this.facts.set(statement.id, {
          id: statement.id,
          kind: "responsibility",
          parentId: entry.id,
          text: statement.text,
        });
      }
      for (const achievement of entry.achievements) {
        const metrics = achievement.metrics.map((metric) => `${metric.label} ${metric.value}`).join(" ");
        this.facts.set(achievement.id, {
          id: achievement.id,
          kind: "achievement",
          parentId: entry.id,
          text: `${achievement.text} ${metrics}`.trim(),
        });
      }
    }
    for (const project of profile.projects) {
      this.facts.set(project.id, {
        id: project.id,
        kind: "project",
        parentId: project.id,
        text: `${project.name} ${project.description}`,
      });
      for (const outcome of project.outcomes) {
        this.facts.set(outcome.id, { id: outcome.id, kind: "outcome", parentId: project.id, text: outcome.text });
      }
    }
    this.skillNames = profile.skills.map((skill) => skill.name);
    this.technologyTerms = [
      ...profile.experience.flatMap((entry) => entry.technologies),
      ...profile.projects.flatMap((project) => project.technologies),
      ...profile.certifications.map((certification) => certification.name),
    ];
  }

  sourceText(ids: string[]): string {
    return ids
      .map((id) => this.facts.get(id)?.text ?? "")
      .filter(Boolean)
      .join(" \n ");
  }

  /** All confirmed text that may support a profile-wide claim (summary). */
  allText(): string {
    return [
      this.profile.summary.text,
      ...this.profile.summary.keyStrengths,
      ...this.profile.summary.specializations,
      ...this.profile.summary.highlights,
      ...[...this.facts.values()].map((fact) => fact.text),
      ...this.skillNames,
      ...this.technologyTerms,
      ...this.profile.experience.map((entry) => `${entry.title} ${entry.employer}`),
      ...this.profile.education.map((entry) => `${entry.degree} ${entry.fieldOfStudy} ${entry.institution}`),
    ].join(" \n ");
  }
}

/** Extract numeric tokens (e.g. "40%", "1,200", "3.5", "2021") in normalized form. */
export function numericTokens(text: string): string[] {
  const matches = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  return matches.map((token) => token.replace(/,/g, ""));
}

/** Terms whose presence in a claim must be backed by evidence. */
export function sensitiveTerms(analysis: JobAnalysis | null): string[] {
  const fromJob = (analysis?.requirements ?? []).flatMap((requirement) => requirement.relatedSkills);
  const all = [...fromJob, ...TECH_KEYWORDS].map((term) => normalizeTerm(term));
  const unique = new Set<string>();
  for (const term of all) {
    if (!term) continue;
    if (term.length < 3 && term !== "c#" && term !== "go") continue;
    unique.add(term);
  }
  return [...unique];
}

export interface ClaimCheckContext {
  index: SourceIndex;
  terms: string[];
}

/**
 * Check one bullet against its cited sources. Returns a reason when the claim
 * must be rejected, otherwise null.
 */
export function checkBullet(bullet: ResumeBullet, parentId: string, context: ClaimCheckContext): string | null {
  if (bullet.sourceIds.length === 0) {
    return "No evidence reference was provided.";
  }
  for (const id of bullet.sourceIds) {
    const fact = context.index.facts.get(id);
    if (!fact) return `Evidence reference "${id}" does not exist in the confirmed profile.`;
    if (fact.parentId !== parentId) return "Evidence reference belongs to a different role or project.";
  }
  const sourceText = context.index.sourceText(bullet.sourceIds);
  return checkTextAgainstSources(bullet.text, sourceText, parentId, context);
}

export function checkTextAgainstSources(
  text: string,
  sourceText: string,
  parentId: string | null,
  context: ClaimCheckContext,
): string | null {
  const sourceNumbers = new Set(numericTokens(sourceText));
  for (const token of numericTokens(text)) {
    if (!sourceNumbers.has(token)) {
      return `The number "${token}" does not appear in the cited evidence.`;
    }
  }
  const allowedTechnology = allowedTechnologyTerms(parentId, context.index);
  for (const term of context.terms) {
    if (!containsTerm(text, term)) continue;
    if (containsTerm(sourceText, term)) continue;
    if (allowedTechnology.some((allowed) => containsTerm(allowed, term) || containsTerm(term, allowed))) continue;
    return `"${term}" is not supported by the cited evidence or confirmed skills.`;
  }
  return null;
}

function allowedTechnologyTerms(parentId: string | null, index: SourceIndex): string[] {
  const terms = [...index.skillNames];
  if (parentId) {
    const experience = index.profile.experience.find((entry) => entry.id === parentId);
    if (experience) terms.push(...experience.technologies);
    const project = index.profile.projects.find((entry) => entry.id === parentId);
    if (project) terms.push(...project.technologies);
  } else {
    terms.push(...index.technologyTerms);
  }
  return terms;
}

export interface ClaimValidationResult {
  content: ResumeContent;
  rejected: RejectedClaim[];
  status: ValidationStatus;
}

/**
 * Stage 5: validate factual integrity. Unsupported claims are removed from the
 * content and reported; employment facts are restored from the profile.
 */
export function validateClaims(
  source: CareerProfileData,
  analysis: JobAnalysis | null,
  content: ResumeContent,
): ClaimValidationResult {
  const profile = confirmedFactsOnly(source);
  const index = new SourceIndex(profile);
  const context: ClaimCheckContext = { index, terms: sensitiveTerms(analysis) };
  const rejected: RejectedClaim[] = [];

  const experience = content.experience
    .map((entry) => {
      const source = profile.experience.find((candidate) => candidate.id === entry.id);
      if (!source) {
        rejected.push({
          location: entry.employer,
          text: `${entry.title} at ${entry.employer}`,
          reason: "Role is not part of the confirmed profile.",
        });
        return null;
      }
      const immutable = {
        employer: source.employer,
        title: source.title,
        startDate: source.startDate,
        endDate: source.endDate,
        location: source.location,
      };
      if (
        entry.employer !== immutable.employer ||
        entry.title !== immutable.title ||
        entry.startDate !== immutable.startDate ||
        entry.endDate !== immutable.endDate
      ) {
        rejected.push({
          location: source.employer,
          text: `${entry.title}, ${entry.startDate} - ${entry.endDate || "Present"}`,
          reason: "Employment details were altered; restored from the confirmed profile.",
        });
      }
      const bullets = entry.bullets.filter((bullet) => {
        const reason = checkBullet(bullet, source.id, context);
        if (reason) rejected.push({ location: `${source.title} at ${source.employer}`, text: bullet.text, reason });
        return !reason;
      });
      const technologies = entry.technologies.filter((tech) =>
        source.technologies.some((known) => normalizeTerm(known) === normalizeTerm(tech)),
      );
      return { ...entry, ...immutable, bullets, technologies };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const projects = content.projects
    .map((entry) => {
      const source = profile.projects.find((candidate) => candidate.id === entry.id);
      if (!source) {
        rejected.push({
          location: "Projects",
          text: entry.name,
          reason: "Project is not part of the confirmed profile.",
        });
        return null;
      }
      const bullets = entry.bullets.filter((bullet) => {
        const reason = checkBullet(bullet, source.id, context);
        if (reason) rejected.push({ location: `Project ${source.name}`, text: bullet.text, reason });
        return !reason;
      });
      return {
        ...entry,
        name: source.name,
        role: source.role,
        description: source.description,
        technologies: source.technologies,
        url: source.url,
        repositoryUrl: source.repositoryUrl,
        bullets,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const skills = content.skills
    .map((skill) => profile.skills.find((candidate) => candidate.id === skill.id))
    .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill))
    .map((skill) => ({ id: skill.id, name: skill.name, category: skill.category }));
  if (skills.length !== content.skills.length) {
    rejected.push({
      location: "Skills",
      text: "One or more skills",
      reason: "Skills not present in the confirmed profile were removed.",
    });
  }

  let summary = content.summary;
  if (summary.text.trim()) {
    const summarySources = summary.sourceIds.filter((id) => index.facts.has(id));
    const sourceText =
      summarySources.length > 0 ? `${index.sourceText(summarySources)} \n ${profile.summary.text}` : index.allText();
    const reason = checkTextAgainstSources(summary.text, sourceText, null, context);
    if (reason) {
      rejected.push({ location: "Summary", text: summary.text, reason });
      summary = { text: profile.summary.text, sourceIds: [] };
    }
  }

  const sanitized: ResumeContent = {
    ...content,
    summary,
    experience,
    projects,
    skills,
    education: profile.education.filter((entry) => content.education.some((item) => item.id === entry.id)),
    certifications: profile.certifications.filter((entry) =>
      content.certifications.some((item) => item.id === entry.id),
    ),
    languages: profile.languages.filter((entry) => content.languages.some((item) => item.id === entry.id)),
    additionalSections: profile.additionalSections.filter((entry) =>
      content.additionalSections.some((item) => item.id === entry.id),
    ),
  };

  const hasBullets =
    sanitized.experience.some((entry) => entry.bullets.length > 0) ||
    sanitized.projects.some((entry) => entry.bullets.length > 0);
  const status: ValidationStatus =
    rejected.length === 0
      ? "passed"
      : hasBullets || sanitized.summary.text.trim()
        ? "passed_with_rejections"
        : "failed";
  return { content: sanitized, rejected, status };
}
