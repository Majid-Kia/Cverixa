import type { CareerProfileData } from "@/features/career-profile/schema";
import { containsTerm, normalizeTerm } from "@/features/job-analysis/keywords";
import type { JobAnalysis, JobRequirement } from "@/features/job-analysis/schema";
import type { EvidenceMap, EvidenceRef, EvidenceStatus, RequirementMatch } from "./schema";
import { signalsAsked, type EvidenceSignal } from "./signals";

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

const IRREGULAR_STEMS: Record<string, string> = {
  built: "build",
  led: "lead",
  ran: "run",
  wrote: "write",
  written: "write",
  grew: "grow",
  made: "make",
  drove: "drive",
  driven: "drive",
  took: "take",
  taught: "teach",
};

/** Light stemmer so "ships", "shipped" and "shipping" match. Deliberately crude and transparent. */
export function stem(word: string): string {
  let value = word.toLowerCase();
  if (IRREGULAR_STEMS[value]) return IRREGULAR_STEMS[value];
  if (value.length <= 3) return value;
  if (value.endsWith("ies") && value.length > 4) value = `${value.slice(0, -3)}y`;
  else if (value.endsWith("ing") && value.length > 5) value = value.slice(0, -3);
  else if (value.endsWith("ed") && value.length > 4) value = value.slice(0, -2);
  else if (value.endsWith("es") && value.length > 4) value = value.slice(0, -2);
  else if (value.endsWith("s") && !value.endsWith("ss") && value.length > 3) value = value.slice(0, -1);
  if (value.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(value) && !/(ll|ss|ff|zz)$/.test(value)) {
    value = value.slice(0, -1);
  }
  if (value.length > 4 && value.endsWith("e")) value = value.slice(0, -1);
  return value;
}

/** Stems of every word in a text. */
export function stemSet(text: string): Set<string> {
  return new Set(
    normalizeTerm(text)
      .split(/[^a-z0-9+#]+/)
      .filter(Boolean)
      .map(stem),
  );
}

/** Words that appear in almost every engineering statement; they count for little on their own. */
const GENERIC_STEMS = new Set(
  [
    "build",
    "product",
    "feature",
    "software",
    "engineer",
    "engineering",
    "develop",
    "development",
    "developer",
    "role",
    "company",
    "help",
    "across",
    "include",
    "great",
    "time",
    "code",
    "application",
    "tool",
    "system",
    "solution",
    "technical",
    "technology",
    "business",
    "project",
    "deliver",
    "create",
    "make",
    "need",
    "want",
    "look",
    "join",
    "high",
    "quality",
    "ensure",
    "improve",
    "maintain",
    "support",
    "collaborate",
    "close",
    "every",
    "people",
    "thing",
    "they",
    "their",
    "them",
    "have",
    "what",
    "about",
    "more",
    "most",
    "well",
    "also",
    "into",
    "used",
    "like",
    "care",
    "real",
    "world",
    "user",
    "frontend",
    "front",
    "first",
    "idea",
    "today",
    "around",
    "behind",
    "learn",
    "understand",
    "reason",
    "reasoning",
    "keep",
  ].map(stem),
);

/**
 * Related vocabulary for common product areas and engineering practices, so a
 * "travel product" criterion can find a "tour-booking system". `domain` groups
 * describe what a product is for, `feature` groups what it does, and
 * `practice` groups how the work was done. Concept matches are reported as
 * related evidence, never as proof of a skill.
 */
export interface ConceptGroup {
  id: string;
  kind: "domain" | "feature" | "practice";
  terms: string[];
}

export const CONCEPT_GROUPS: ConceptGroup[] = [
  {
    id: "travel",
    kind: "domain",
    terms: [
      "travel",
      "traveller",
      "traveler",
      "trip",
      "tour",
      "tourism",
      "booking",
      "itinerary",
      "destination",
      "hotel",
      "flight",
      "holiday",
      "vacation",
    ],
  },
  {
    id: "consumer",
    kind: "domain",
    terms: ["consumer", "b2c", "shopper", "storefront", "commerce", "ecommerce", "checkout", "marketplace", "retail"],
  },
  {
    id: "finance_risk",
    kind: "domain",
    terms: [
      "fraud",
      "risk",
      "payment",
      "fintech",
      "banking",
      "compliance",
      "aml",
      "kyc",
      "transaction",
      "lending",
      "insurance",
    ],
  },
  {
    id: "expert_tools",
    kind: "domain",
    terms: [
      "dense",
      "expert",
      "operational",
      "operations",
      "operator",
      "analyst",
      "internal tool",
      "back-office",
      "backoffice",
      "workflow",
      "triage",
      "portal",
      "console",
      "admin",
      "power user",
    ],
  },
  { id: "healthcare", kind: "domain", terms: ["health", "healthcare", "clinical", "patient", "medical", "hospital"] },
  { id: "education", kind: "domain", terms: ["education", "edtech", "student", "teacher", "curriculum", "classroom"] },
  { id: "logistics", kind: "domain", terms: ["logistics", "freight", "fleet", "warehouse", "courier", "supply chain"] },
  { id: "developer_tools", kind: "domain", terms: ["developer tool", "sdk", "cli", "api platform", "devtools"] },
  {
    id: "search",
    kind: "feature",
    terms: ["search", "filter", "filtering", "discovery", "browse", "catalog", "catalogue"],
  },
  {
    id: "data_visualisation",
    kind: "feature",
    terms: ["chart", "visualisation", "visualization", "graph", "map", "dashboard", "reporting", "table"],
  },
  {
    id: "performance",
    kind: "practice",
    terms: [
      "performance",
      "fast",
      "speed",
      "latency",
      "web vitals",
      "lighthouse",
      "bundle",
      "contentful paint",
      "load time",
    ],
  },
  {
    id: "testing",
    kind: "practice",
    terms: ["test", "testing", "tested", "coverage", "playwright", "cypress", "jest", "vitest", "regression"],
  },
  {
    id: "accessibility",
    kind: "practice",
    terms: ["accessibility", "accessible", "a11y", "wcag", "screen reader", "aria", "keyboard navigation"],
  },
  {
    id: "design_system",
    kind: "practice",
    terms: ["design system", "component library", "storybook", "design tokens"],
  },
  { id: "mobile", kind: "practice", terms: ["mobile", "ios", "android", "react native", "responsive"] },
];

function hitsConcept(text: string, stems: Set<string>, group: ConceptGroup): string | null {
  for (const term of group.terms) {
    if (/[ -]/.test(term) ? containsTerm(text, term) : stems.has(stem(term))) return term;
  }
  return null;
}

/** Concept groups a text touches. */
export function conceptsIn(text: string): ConceptGroup[] {
  const stems = stemSet(text);
  return CONCEPT_GROUPS.filter((group) => hitsConcept(text, stems, group) !== null);
}

/** One citable statement of the confirmed profile, with the role or project it belongs to. */
export interface ProfileFact {
  id: string;
  kind: "achievement" | "responsibility" | "project" | "outcome";
  parentId: string;
  parentKind: "experience" | "project";
  /** "Frontend Engineer at Ledgerline" or "Project: Fieldnotes". */
  parentLabel: string;
  /** `parentLabel` with dates, shown wherever the evidence is listed. */
  source: string;
  /** Position of the parent in the profile: roles first (most recent first), then projects. */
  parentOrder: number;
  text: string;
}

function period(start: string, end: string): string {
  const from = start.trim();
  const to = end.trim() || "Present";
  return from ? `${from} - ${to}` : to;
}

/** Every citable statement across all confirmed roles and projects, including older ones. */
export function listProfileFacts(profile: CareerProfileData): ProfileFact[] {
  const facts: ProfileFact[] = [];
  profile.experience.forEach((entry, index) => {
    const parentLabel = `${entry.title} at ${entry.employer}`;
    const base = {
      parentId: entry.id,
      parentKind: "experience" as const,
      parentLabel,
      source: `${parentLabel} (${period(entry.startDate, entry.endDate)})`,
      parentOrder: index,
    };
    for (const achievement of entry.achievements) {
      const metrics = achievement.metrics.map((metric) => `${metric.label} ${metric.value}`).join(" ");
      facts.push({
        ...base,
        id: achievement.id,
        kind: "achievement",
        text: `${achievement.text} ${metrics}`.trim(),
      });
    }
    for (const statement of entry.responsibilities) {
      facts.push({ ...base, id: statement.id, kind: "responsibility", text: statement.text });
    }
  });
  profile.projects.forEach((project, index) => {
    const base = {
      parentId: project.id,
      parentKind: "project" as const,
      parentLabel: `Project: ${project.name}`,
      source: `Project: ${project.name}`,
      parentOrder: profile.experience.length + index,
    };
    if (project.description.trim()) {
      facts.push({ ...base, id: project.id, kind: "project", text: `${project.name} ${project.description}` });
    }
    for (const outcome of project.outcomes) {
      facts.push({ ...base, id: outcome.id, kind: "outcome", text: outcome.text });
    }
  });
  return facts;
}

const TECHNICAL_CATEGORIES = new Set(["technical_skill", "preferred_skill", "qualification"]);

/** Precomputed view of a requirement used to score statements against it. */
export interface RequirementMatcher {
  requirement: JobRequirement;
  technical: boolean;
  /** Exact terms (skills, tools) taken from the posting. */
  skillTerms: string[];
  /** Stemmed description words with their weight. */
  words: Array<{ stem: string; weight: number }>;
  concepts: ConceptGroup[];
  asked: EvidenceSignal[];
}

export function buildMatcher(requirement: JobRequirement): RequirementMatcher {
  const technical = TECHNICAL_CATEGORIES.has(requirement.category);
  const words = new Map<string, number>();
  for (const word of extractDescriptionTerms(requirement)) {
    for (const part of word.split(/[^a-z0-9+#]+/).filter((piece) => piece.length >= 3)) {
      const value = stem(part);
      if (STOPWORDS.has(part) || STOPWORDS.has(value)) continue;
      words.set(value, GENERIC_STEMS.has(value) ? 0.25 : 1);
    }
  }
  const context = `${requirement.description} ${requirement.supportingText}`;
  return {
    requirement,
    technical,
    skillTerms: uniqueTerms(requirement.relatedSkills),
    words: [...words.entries()].map(([value, weight]) => ({ stem: value, weight })),
    concepts: technical ? [] : conceptsIn(context),
    asked: signalsAsked(context),
  };
}

/**
 * How strongly one statement speaks to a requirement. 0 means unrelated; 1 is
 * a single specific overlap; higher means several. A transparent heuristic,
 * not a probability.
 */
export function factScore(matcher: RequirementMatcher, fact: ProfileFact): number {
  let score = 0;
  const stems = stemSet(fact.text);
  const literal = new Set<string>();
  for (const term of matcher.skillTerms) {
    const single = !/[ ./+#-]/.test(term);
    if (containsTerm(fact.text, term) || (!matcher.technical && single && stems.has(stem(term)))) {
      score += 1.5;
      literal.add(stem(term));
    }
  }
  for (const word of matcher.words) {
    if (stems.has(word.stem) && !literal.has(word.stem)) {
      score += word.weight;
      literal.add(word.stem);
    }
  }
  for (const group of matcher.concepts) {
    const hit = group.terms.find((term) =>
      /[ -]/.test(term) ? containsTerm(fact.text, term) : stems.has(stem(term)) && !literal.has(stem(term)),
    );
    if (hit) score += 1;
  }
  for (const signal of matcher.asked) {
    if (signal.shows.test(fact.text)) score += 2;
  }
  return score;
}

/**
 * Deterministic evidence matcher (PRD 9.2 stage 2). It maps each requirement to
 * confirmed facts across every role and project using term matching; it never
 * invents support. Results are a transparent heuristic, not a score.
 */
export function matchEvidence(profile: CareerProfileData, analysis: JobAnalysis): EvidenceMap {
  const facts = listProfileFacts(profile);
  const matches = analysis.requirements.map((requirement) => matchRequirement(profile, facts, requirement));
  return { matches };
}

function matchRequirement(
  profile: CareerProfileData,
  facts: ProfileFact[],
  requirement: JobRequirement,
): RequirementMatch {
  const matcher = buildMatcher(requirement);
  const terms = uniqueTerms([...requirement.relatedSkills, ...extractDescriptionTerms(requirement)]);
  const strong: EvidenceRef[] = [];

  for (const term of terms) {
    for (const skill of profile.skills) {
      if (containsTerm(skill.name, term) || containsTerm(term, skill.name)) {
        push(strong, { id: skill.id, kind: "skill", label: skill.name, parentId: "", source: "Skills" });
      }
    }
    profile.experience.forEach((entry) => {
      if (entry.technologies.some((tech) => containsTerm(tech, term) || containsTerm(term, tech))) {
        const label = `${entry.title} at ${entry.employer}`;
        push(strong, {
          id: entry.id,
          kind: "experience",
          label,
          parentId: entry.id,
          source: `${label} (${period(entry.startDate, entry.endDate)})`,
        });
      }
    });
    for (const project of profile.projects) {
      if (project.technologies.some((tech) => containsTerm(tech, term) || containsTerm(term, tech))) {
        push(strong, {
          id: project.id,
          kind: "project",
          label: project.name,
          parentId: project.id,
          source: `Project: ${project.name}`,
        });
      }
    }
    for (const certification of profile.certifications) {
      if (containsTerm(certification.name, term)) {
        push(strong, {
          id: certification.id,
          kind: "certification",
          label: certification.name,
          parentId: "",
          source: "Certifications",
        });
      }
    }
    for (const education of profile.education) {
      const text = `${education.degree} ${education.fieldOfStudy} ${education.institution}`;
      if (containsTerm(text, term)) {
        push(strong, {
          id: education.id,
          kind: "education",
          label: `${education.degree} ${education.institution}`.trim(),
          parentId: "",
          source: "Education",
        });
      }
    }
  }

  const scored = facts
    .map((fact) => ({ fact, score: factScore(matcher, fact) }))
    .filter((item) => item.score >= 1)
    .sort((a, b) => b.score - a.score);
  const weak: EvidenceRef[] = [];
  for (const item of scored) push(weak, factRef(item.fact));

  let status: EvidenceStatus;
  if (strong.length > 0) {
    status = "supported";
  } else if (scored.length > 0) {
    const best = scored[0].score;
    status = matcher.technical
      ? "partially_supported"
      : best >= 2 || scored.length >= 2
        ? "supported"
        : "partially_supported";
  } else {
    status = "not_evidenced";
  }

  // A criterion that asks for stated evidence (customer contact, usage tracking, design
  // ownership, ...) is not fully supported by related experience alone.
  const missingSignals = matcher.asked.filter((signal) => !scored.some((item) => signal.shows.test(item.fact.text)));
  if (missingSignals.length > 0 && status === "supported") status = "partially_supported";

  const evidence = [...strong, ...weak].slice(0, 8);
  const missing =
    missingSignals.length > 0
      ? missingSignals.map((signal) => signal.gap).join(" ")
      : status === "not_evidenced"
        ? `No confirmed experience mentions ${terms.slice(0, 3).join(", ") || "this requirement"}.`
        : "";
  return {
    requirementId: requirement.id,
    description: requirement.description,
    classification: requirement.classification,
    status,
    evidence,
    missing,
    missingSignals: missingSignals.map((signal) => signal.id),
  };
}

/** Evidence reference for a statement, carrying the role or project it belongs to. */
export function factRef(fact: ProfileFact): EvidenceRef {
  return {
    id: fact.id,
    kind: fact.kind,
    label: fact.kind === "project" ? fact.parentLabel.replace(/^Project: /, "") : truncate(fact.text),
    parentId: fact.parentId,
    source: fact.source,
    basis: "term",
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

function push(list: EvidenceRef[], ref: Omit<EvidenceRef, "basis">) {
  if (!list.some((item) => item.id === ref.id && item.kind === ref.kind)) list.push({ ...ref, basis: "term" });
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
