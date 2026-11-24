import type { CareerProfileData } from "@/features/career-profile/schema";
import { containsTerm, normalizeTerm } from "@/features/job-analysis/keywords";
import type { JobAnalysis } from "@/features/job-analysis/schema";
import { isNamedTechnology, matchEvidence, stem } from "@/features/resume-tailoring/evidence";
import type { EvidenceMap } from "@/features/resume-tailoring/schema";
import {
  RUBRIC_VERSION,
  type MatchBreakdown,
  type MatchComponent,
  type MatchingQualification,
  type MissingQualification,
  type Rubric,
} from "./schema";

/**
 * Job Match Score. The score says how relevant a job is to the confirmed
 * Master Career Profile; it is not a probability of getting an interview.
 *
 * It is computed without AI from two inputs: the requirements extracted from
 * the posting and the deterministic evidence matcher that the resume tailoring
 * pipeline already uses. A requirement counts only when a confirmed profile
 * fact supports it, so the score cannot credit an undocumented qualification.
 */
export interface MatchResult {
  rubricVersion: number;
  score: number;
  breakdown: MatchBreakdown;
  explanation: string;
  matchingSkills: string[];
  missingQualifications: MissingQualification[];
}

export interface MatchInput {
  profile: CareerProfileData;
  analysis: JobAnalysis;
  jobTitle: string;
  rubric: Rubric;
  /** Minimum years the posting asks for, when the AI extracted one. */
  requiredYears?: number | null;
  /** The reference date for experience still in progress. */
  now?: Date;
}

const LABELS: Record<MatchComponent["id"], string> = {
  mandatory: "Mandatory requirements",
  skills: "Named technologies",
  preferred: "Preferred requirements",
  title: "Title alignment",
  seniority: "Seniority and experience",
};

const CREDIT = { supported: 1, partially_supported: 0.5, not_evidenced: 0 } as const;

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Parse the profile's free-text dates ("2021-03", "Mar 2021", "2021") to a month index. */
export function parseProfileDate(value: string, fallbackMonth: number): number | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  const year = text.match(/\b(19|20)\d{2}\b/);
  if (!year) return null;
  let month = fallbackMonth;
  const numeric = text.match(/\b(?:19|20)\d{2}[-/.](\d{1,2})\b/) ?? text.match(/\b(\d{1,2})[-/.](?:19|20)\d{2}\b/);
  if (numeric) month = Math.min(11, Math.max(0, Number(numeric[1]) - 1));
  else {
    const named = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
    if (named) month = MONTHS[named[1]];
  }
  return Number(year[0]) * 12 + month;
}

/** Years of professional experience in the profile; overlapping roles are counted once. */
export function experienceYears(profile: CareerProfileData, now = new Date()): number | null {
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const spans: Array<[number, number]> = [];
  for (const entry of profile.experience) {
    const start = parseProfileDate(entry.startDate, 0);
    if (start === null) continue;
    const end = entry.endDate.trim() ? (parseProfileDate(entry.endDate, 11) ?? current) : current;
    if (end >= start) spans.push([start, Math.min(end, current)]);
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [from, to] = spans[0];
  for (const [start, end] of spans.slice(1)) {
    if (start <= to + 1) to = Math.max(to, end);
    else {
      months += to - from + 1;
      [from, to] = [start, end];
    }
  }
  months += to - from + 1;
  return Math.round((months / 12) * 10) / 10;
}

const LEVELS: Array<{ level: number; pattern: RegExp }> = [
  { level: 5, pattern: /\b(head|director|vp|vice president|chief|cto|engineering manager|manager)\b/ },
  { level: 4, pattern: /\b(staff|principal|lead|architect|tech lead|team lead)\b/ },
  { level: 3, pattern: /\b(senior|sr|snr|expert)\b/ },
  { level: 1, pattern: /\b(junior|jr|entry|graduate|trainee|associate|werkstudent|working student)\b/ },
  { level: 0, pattern: /\b(intern|internship|praktikum|apprentice)\b/ },
  { level: 2, pattern: /\b(mid|mid-level|intermediate|medior)\b/ },
];

/** Seniority level named by a title or level label; null when it names none. */
export function seniorityLevel(text: string): number | null {
  const value = normalizeTerm(text);
  for (const { level, pattern } of LEVELS) if (pattern.test(value)) return level;
  return null;
}

const SENIORITY_WORDS = new Set(
  ["senior", "sr", "junior", "jr", "staff", "principal", "lead", "mid", "level", "intern", "expert", "head"].map(stem),
);
const ROLE_SYNONYMS: Record<string, string> = { developer: "engineer", dev: "engineer", programmer: "engineer" };
const TITLE_FILLER = new Set(["the", "and", "for", "with", "of", "in", "at", "all", "genders", "team", "focused"]);

function roleTokens(text: string): string[] {
  return normalizeTerm(text.replace(/\((?:[mfwdx]\s*[/|]\s*){1,3}[mfwdx*]\)/gi, " "))
    .split(/[^a-z0-9+#.]+/)
    .filter((token) => token.length >= 2 && !TITLE_FILLER.has(token))
    .map((token) => ROLE_SYNONYMS[token] ?? token)
    .map(stem)
    .filter((token) => !SENIORITY_WORDS.has(token));
}

/** Requirement years stated in the extracted requirements ("5+ years of React"). */
export function statedYears(analysis: JobAnalysis): number | null {
  let best: number | null = null;
  for (const requirement of analysis.requirements) {
    const text = `${requirement.description} ${requirement.supportingText}`;
    for (const match of text.matchAll(/\b(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?|jahre)\b/gi)) {
      const years = Number(match[1]);
      if (years > 0 && years <= 20 && (best === null || years > best)) best = years;
    }
  }
  return best;
}

function profileVocabulary(profile: CareerProfileData): string[] {
  return [
    ...profile.skills.map((skill) => skill.name),
    ...profile.experience.flatMap((entry) => entry.technologies),
    ...profile.projects.flatMap((project) => project.technologies),
  ].filter(Boolean);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Score one job against the confirmed profile. Deterministic and repeatable. */
export function computeMatch(input: MatchInput): MatchResult {
  const { profile, analysis, rubric } = input;
  const evidence: EvidenceMap = matchEvidence(profile, analysis);
  const statusOf = new Map(evidence.matches.map((match) => [match.requirementId, match]));
  const scored = analysis.requirements.filter((requirement) => requirement.category !== "restriction");
  const restrictions = analysis.requirements
    .filter((requirement) => requirement.category === "restriction")
    .map((requirement) => requirement.description);

  const coverage = (classification: "mandatory" | "preferred") => {
    const items = scored.filter((requirement) => requirement.classification === classification);
    if (items.length === 0) return { value: null as number | null, supported: 0, partial: 0, total: 0 };
    let credit = 0;
    let supported = 0;
    let partial = 0;
    for (const requirement of items) {
      const status = statusOf.get(requirement.id)?.status ?? "not_evidenced";
      credit += CREDIT[status];
      if (status === "supported") supported += 1;
      else if (status === "partially_supported") partial += 1;
    }
    return { value: credit / items.length, supported, partial, total: items.length };
  };
  const mandatory = coverage("mandatory");
  const preferred = coverage("preferred");

  // Named technologies the posting asks for, checked against the profile's skills and technologies.
  const vocabulary = profileVocabulary(profile);
  const asked = new Map<string, string>();
  for (const requirement of scored) {
    if (requirement.category !== "technical_skill" && requirement.category !== "preferred_skill") continue;
    for (const skill of requirement.relatedSkills) {
      if (isNamedTechnology(skill) && !asked.has(normalizeTerm(skill))) asked.set(normalizeTerm(skill), skill.trim());
    }
  }
  const matchingSkills: string[] = [];
  const missingSkills: string[] = [];
  for (const skill of asked.values()) {
    const known = vocabulary.some((term) => containsTerm(term, skill) || containsTerm(skill, term));
    (known ? matchingSkills : missingSkills).push(skill);
  }
  const skillsValue = asked.size > 0 ? matchingSkills.length / asked.size : null;

  // Title: how much of the job title's role vocabulary appears in the candidate's own titles.
  const jobTokens = [...new Set(roleTokens(input.jobTitle || analysis.jobTitle))];
  const ownTokens = new Set([
    ...profile.experience.flatMap((entry) => roleTokens(entry.title)),
    ...roleTokens(profile.personal.headline),
  ]);
  const skillTokens = new Set(vocabulary.flatMap((term) => roleTokens(term)));
  const titleHits = jobTokens.filter((token) => ownTokens.has(token) || skillTokens.has(token));
  const titleValue = jobTokens.length > 0 ? titleHits.length / jobTokens.length : null;

  // Seniority: stated years against the profile's years, and level against the most recent title.
  const candidateYears = experienceYears(profile, input.now);
  const requiredYears = input.requiredYears ?? statedYears(analysis);
  const jobLevel = seniorityLevel(`${input.jobTitle} ${analysis.seniority}`);
  const ownLevel = profile.experience[0] ? seniorityLevel(profile.experience[0].title) : null;
  const seniorityParts: number[] = [];
  const seniorityNotes: string[] = [];
  if (requiredYears && candidateYears !== null) {
    seniorityParts.push(Math.min(1, candidateYears / requiredYears));
    seniorityNotes.push(`the posting asks for ${requiredYears}+ years and the profile shows about ${candidateYears}`);
  }
  if (jobLevel !== null && (ownLevel !== null || candidateYears !== null)) {
    const inferred = ownLevel ?? (candidateYears! >= 8 ? 3 : candidateYears! >= 3 ? 2 : 1);
    const gap = jobLevel - inferred;
    seniorityParts.push(gap <= -2 ? 0.6 : gap <= 0 ? 1 : gap === 1 ? 0.6 : 0.25);
    seniorityNotes.push(
      gap === 0
        ? "the role's level matches the most recent title"
        : gap > 0
          ? "the role is more senior than the most recent title"
          : "the role is more junior than the most recent title",
    );
  }
  const seniorityValue = seniorityParts.length
    ? seniorityParts.reduce((sum, value) => sum + value, 0) / seniorityParts.length
    : null;

  const values: Record<MatchComponent["id"], number | null> = {
    mandatory: mandatory.value,
    skills: skillsValue,
    preferred: preferred.value,
    title: titleValue,
    seniority: seniorityValue,
  };
  const details: Record<MatchComponent["id"], string> = {
    mandatory:
      mandatory.total > 0
        ? `${mandatory.supported} of ${mandatory.total} supported by the confirmed profile${mandatory.partial ? `, ${mandatory.partial} partly` : ""}.`
        : "The posting states no mandatory requirements.",
    skills:
      asked.size > 0
        ? `${matchingSkills.length} of ${asked.size} named technologies are in the profile${missingSkills.length ? ` (not found: ${missingSkills.slice(0, 6).join(", ")})` : ""}.`
        : "The posting names no specific technologies.",
    preferred:
      preferred.total > 0
        ? `${preferred.supported} of ${preferred.total} supported${preferred.partial ? `, ${preferred.partial} partly` : ""}.`
        : "The posting states no preferred requirements.",
    title:
      jobTokens.length > 0
        ? `${titleHits.length} of ${jobTokens.length} role words in the job title appear in the profile's titles or skills.`
        : "The job title could not be compared.",
    seniority: seniorityNotes.length
      ? `${seniorityNotes.join("; ")}.`.replace(/^./, (letter) => letter.toUpperCase())
      : "Neither the posting nor the profile states a level that can be compared.",
  };

  const ids: Array<MatchComponent["id"]> = ["mandatory", "skills", "preferred", "title", "seniority"];
  const applicable = ids.filter((id) => values[id] !== null && rubric.weights[id] > 0);
  const totalWeight = applicable.reduce((sum, id) => sum + rubric.weights[id], 0);
  const components: MatchComponent[] = ids.map((id) => {
    const value = values[id];
    const counts = value !== null && rubric.weights[id] > 0 && totalWeight > 0;
    return {
      id,
      label: LABELS[id],
      weight: rubric.weights[id],
      value: value === null ? null : round(value * 100) / 100,
      points: counts ? round((value! * rubric.weights[id] * 100) / totalWeight) : 0,
      detail: details[id],
    };
  });
  const score =
    totalWeight > 0
      ? Math.round(applicable.reduce((sum, id) => sum + values[id]! * rubric.weights[id], 0) * (100 / totalWeight))
      : 0;

  const missingQualifications: MissingQualification[] = [];
  const matchingQualifications: MatchingQualification[] = [];
  for (const requirement of scored) {
    const match = statusOf.get(requirement.id);
    const status = match?.status ?? "not_evidenced";
    if (status === "supported") {
      matchingQualifications.push({
        description: requirement.description,
        classification: requirement.classification,
        evidence: (match?.evidence ?? []).slice(0, 3).map((ref) => ref.source || ref.label),
      });
    } else {
      missingQualifications.push({
        description: requirement.description,
        classification: requirement.classification,
        status,
        note: match?.missing ?? "",
      });
    }
  }
  missingQualifications.sort(
    (a, b) =>
      Number(b.classification === "mandatory") - Number(a.classification === "mandatory") ||
      Number(b.status === "not_evidenced") - Number(a.status === "not_evidenced"),
  );

  const sentences = [
    mandatory.total > 0
      ? `Your confirmed profile supports ${mandatory.supported} of ${mandatory.total} mandatory requirements${mandatory.partial ? ` and partly supports ${mandatory.partial}` : ""}.`
      : scored.length === 0
        ? "The posting states no requirements that could be extracted, so the score rests on the title and seniority alone."
        : "The posting marks no requirement as mandatory.",
    preferred.total > 0 ? `${preferred.supported} of ${preferred.total} preferred requirements are supported.` : "",
    asked.size > 0
      ? `${matchingSkills.length} of ${asked.size} named technologies are in your profile${missingSkills.length ? `; not found: ${missingSkills.slice(0, 5).join(", ")}` : ""}.`
      : "",
    seniorityNotes.length ? `${details.seniority}` : "",
    restrictions.length ? "Stated restrictions are listed separately and do not change the score." : "",
  ].filter(Boolean);

  return {
    rubricVersion: RUBRIC_VERSION,
    score: Math.max(0, Math.min(100, score)),
    breakdown: {
      components,
      matchingQualifications: matchingQualifications.slice(0, 30),
      restrictions: restrictions.slice(0, 10),
      candidateYears,
      requiredYears: requiredYears ?? null,
    },
    explanation: sentences.join(" "),
    matchingSkills: matchingSkills.slice(0, 30),
    missingQualifications: missingQualifications.slice(0, 30),
  };
}
