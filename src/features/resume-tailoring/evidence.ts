import type { CareerProfileData } from "@/features/career-profile/schema";
import { containsTerm, normalizeTerm } from "@/features/job-analysis/keywords";
import type { JobAnalysis, JobRequirement } from "@/features/job-analysis/schema";
import type { EvidenceMap, EvidenceRef, EvidenceStatus, RequirementMatch } from "./schema";

const STOPWORDS = new Set([
  "with",
  "and",
  "the",
  "for",
  "of",
  "in",
  "to",
  "a",
  "an",
  "or",
  "experience",
  "strong",
  "ability",
  "skills",
  "knowledge",
  "working",
  "using",
  "years",
  "year",
  "plus",
  "familiarity",
  "understanding",
  "proven",
  "excellent",
  "good",
  "solid",
  "hands-on",
  "hands",
  "on",
  "from",
  "that",
  "this",
  "will",
  "you",
  "our",
  "team",
  "work",
]);

/** Significant words from a requirement description (used for non-technical categories). */
export function significantWords(description: string): string[] {
  return normalizeTerm(description)
    .split(" ")
    .map((word) => word.replace(/^[^a-z0-9#+.]+|[^a-z0-9#+]+$/g, ""))
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

/**
 * Deterministic evidence matcher (PRD 9.2 stage 2). It maps each requirement to
 * confirmed facts using term matching; it never invents support. Results are a
 * transparent heuristic, not a score.
 */
export function matchEvidence(profile: CareerProfileData, analysis: JobAnalysis): EvidenceMap {
  const matches = analysis.requirements.map((requirement) => matchRequirement(profile, requirement));
  return { matches };
}

function matchRequirement(profile: CareerProfileData, requirement: JobRequirement): RequirementMatch {
  const terms = uniqueTerms([...requirement.relatedSkills, ...extractDescriptionTerms(requirement)]);
  const strong: EvidenceRef[] = [];
  const weak: EvidenceRef[] = [];

  for (const term of terms) {
    for (const skill of profile.skills) {
      if (containsTerm(skill.name, term) || containsTerm(term, skill.name)) {
        push(strong, { id: skill.id, kind: "skill", label: skill.name });
      }
    }
    for (const entry of profile.experience) {
      const label = `${entry.title} at ${entry.employer}`;
      if (entry.technologies.some((tech) => containsTerm(tech, term) || containsTerm(term, tech))) {
        push(strong, { id: entry.id, kind: "experience", label });
      }
      for (const achievement of entry.achievements) {
        if (containsTerm(achievement.text, term))
          push(weak, { id: achievement.id, kind: "achievement", label: truncate(achievement.text) });
      }
      for (const statement of entry.responsibilities) {
        if (containsTerm(statement.text, term))
          push(weak, { id: statement.id, kind: "responsibility", label: truncate(statement.text) });
      }
    }
    for (const project of profile.projects) {
      if (project.technologies.some((tech) => containsTerm(tech, term) || containsTerm(term, tech))) {
        push(strong, { id: project.id, kind: "project", label: project.name });
      }
      if (containsTerm(project.description, term)) push(weak, { id: project.id, kind: "project", label: project.name });
      for (const outcome of project.outcomes) {
        if (containsTerm(outcome.text, term))
          push(weak, { id: outcome.id, kind: "outcome", label: truncate(outcome.text) });
      }
    }
    for (const certification of profile.certifications) {
      if (containsTerm(certification.name, term))
        push(strong, { id: certification.id, kind: "certification", label: certification.name });
    }
    for (const education of profile.education) {
      const text = `${education.degree} ${education.fieldOfStudy} ${education.institution}`;
      if (containsTerm(text, term))
        push(strong, {
          id: education.id,
          kind: "education",
          label: `${education.degree} ${education.institution}`.trim(),
        });
    }
  }

  const technical =
    requirement.category === "technical_skill" ||
    requirement.category === "preferred_skill" ||
    requirement.category === "qualification";
  let status: EvidenceStatus;
  if (strong.length > 0) {
    status = "supported";
  } else if (weak.length > 0) {
    status = technical ? "partially_supported" : weak.length >= 2 ? "supported" : "partially_supported";
  } else {
    status = "not_evidenced";
  }

  const evidence = [...strong, ...weak].slice(0, 8);
  return {
    requirementId: requirement.id,
    description: requirement.description,
    classification: requirement.classification,
    status,
    evidence,
    missing:
      status === "not_evidenced"
        ? `No confirmed experience mentions ${terms.slice(0, 3).join(", ") || "this requirement"}.`
        : "",
  };
}

function extractDescriptionTerms(requirement: JobRequirement): string[] {
  if (
    requirement.relatedSkills.length > 0 &&
    (requirement.category === "technical_skill" || requirement.category === "preferred_skill")
  ) {
    return [];
  }
  return significantWords(requirement.description);
}

function uniqueTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  return terms
    .map((term) => normalizeTerm(term))
    .filter((term) => term.length >= 2 && !seen.has(term) && (seen.add(term), true));
}

function push(list: EvidenceRef[], ref: EvidenceRef) {
  if (!list.some((item) => item.id === ref.id && item.kind === ref.kind)) list.push(ref);
}

function truncate(text: string, max = 90): string {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

/** Human-readable list of requirements lacking confirmed evidence. */
export function missingRequirementSummaries(evidence: EvidenceMap): string[] {
  return evidence.matches
    .filter((match) => match.status !== "supported")
    .map(
      (match) =>
        `${match.classification === "mandatory" ? "[Mandatory] " : ""}${match.description} (${match.status.replace("_", " ")})`,
    );
}
