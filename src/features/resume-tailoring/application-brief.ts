import type { CareerProfileData } from "@/features/career-profile/schema";
import { buildApplicationContext, type ApplicationContext } from "@/features/job-analysis/application-context";
import type { JobAnalysis, JobRequirement } from "@/features/job-analysis/schema";
import { headlineIssuesForProfile } from "@/features/resume-rendering/content-checks";
import {
  buildMatcher,
  factRef,
  factScore,
  listProfileFacts,
  matchEvidence,
  stemSet,
  type ProfileFact,
  type RequirementMatcher,
} from "./evidence";
import type {
  ApplicationBrief,
  BriefCriterion,
  ClarifyingQuestion,
  EvidenceMap,
  FeaturedSelection,
  TailoringAiOutput,
} from "./schema";
import { getSignal, signalsAsked } from "./signals";

/**
 * Everything decided before the draft is written: which requirements a
 * screener will look at first, what in the whole profile supports each one,
 * which project deserves the first page, and the single question worth asking.
 */
export interface ApplicationPlan {
  evidence: EvidenceMap;
  criteria: BriefCriterion[];
  featured: FeaturedSelection | null;
  question: ClarifyingQuestion | null;
  context: ApplicationContext;
  headlineIssues: string[];
}

const MAX_CRITERIA = 8;
const MAX_FEATURED_STATEMENTS = 3;
const TECHNICAL = new Set(["technical_skill", "preferred_skill", "qualification"]);

function rank(requirement: JobRequirement): number {
  return (
    (requirement.classification === "mandatory" ? 2 : 0) +
    (requirement.priority === "high" ? 2 : requirement.priority === "medium" ? 1 : 0)
  );
}

/**
 * The requirements a screener checks first: mandatory or high-priority ones,
 * with room kept for what the role is about so a long skills list does not
 * crowd it out. Stated restrictions (location, eligibility) are handled apart.
 */
export function selectScreeningRequirements(analysis: JobAnalysis): JobRequirement[] {
  const candidates = analysis.requirements
    .filter((requirement) => requirement.category !== "restriction")
    .map((requirement, index) => ({ requirement, index, rank: rank(requirement) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index);
  const important = candidates.filter((candidate) => candidate.rank >= 2);
  const pool = important.length >= 3 ? important : candidates.slice(0, Math.max(3, important.length));
  const roleShaped = pool.filter((candidate) => !TECHNICAL.has(candidate.requirement.category));
  const technicalCap =
    roleShaped.length >= 2 ? Math.max(2, MAX_CRITERIA - Math.min(roleShaped.length, 5)) : MAX_CRITERIA;
  const picked: typeof pool = [];
  let technical = 0;
  for (const candidate of pool) {
    if (picked.length >= MAX_CRITERIA) break;
    if (TECHNICAL.has(candidate.requirement.category)) {
      if (technical >= technicalCap) continue;
      technical += 1;
    }
    picked.push(candidate);
  }
  return picked.sort((a, b) => a.index - b.index).map((candidate) => candidate.requirement);
}

/** A named piece of work inside one role, or a profile project. */
export interface ProjectUnit {
  entryId: string;
  entryKind: "experience" | "project";
  title: string;
  /** How to refer to it in a question, e.g. "the fraud-detection portal". */
  reference: string;
  source: string;
  label: string;
  order: number;
  facts: ProfileFact[];
}

const PROJECT_NOUNS =
  "portal|platform|system|dashboard|app|application|tool|toolkit|library|service|website|site|engine|pipeline|editor|console|marketplace|suite|sdk|cms|crm|extension|plugin|workspace|builder|planner|tracker";
const PHRASE_BLOCKED = "to|and|of|for|with|in|on|by|that|which|a|an|the|our|its|their|from|into|new|used|using|own";
const PROJECT_PHRASE = new RegExp(
  `\\b(?:an?|the|our|its|their)\\s+((?:(?!(?:${PHRASE_BLOCKED})\\b)[A-Za-z][\\w-]*\\s+){0,3}?(${PROJECT_NOUNS}))\\b`,
  "i",
);

/** The project a statement names, e.g. "fraud-detection portal" (head noun "portal"). */
export function projectPhrase(text: string): { phrase: string; head: string } | null {
  const match = text.match(PROJECT_PHRASE);
  if (!match) return null;
  return { phrase: match[1].replace(/\s+/g, " ").trim(), head: match[2].toLowerCase() };
}

function capitalise(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/**
 * Candidate projects across the whole profile: every profile project, plus
 * every piece of work a role's statements name ("the tour-booking system").
 * Statements that refer back to it ("the portal") join the same unit.
 */
export function listProjectUnits(profile: CareerProfileData, facts = listProfileFacts(profile)): ProjectUnit[] {
  const units: ProjectUnit[] = [];
  for (const entry of profile.experience) {
    const own = facts.filter((fact) => fact.parentId === entry.id);
    const named = new Map<string, { phrase: string; head: string; facts: ProfileFact[] }>();
    const bare: Array<{ head: string; fact: ProfileFact }> = [];
    for (const fact of own) {
      const found = projectPhrase(fact.text);
      if (!found) continue;
      if (!found.phrase.includes(" ") && !found.phrase.includes("-")) {
        bare.push({ head: found.head, fact });
        continue;
      }
      const key = found.phrase.toLowerCase();
      const cluster = named.get(key) ?? { phrase: found.phrase, head: found.head, facts: [] };
      cluster.facts.push(fact);
      named.set(key, cluster);
    }
    for (const reference of bare) {
      const sameHead = [...named.values()].filter((cluster) => cluster.head === reference.head);
      if (sameHead.length === 1 && !sameHead[0].facts.includes(reference.fact)) sameHead[0].facts.push(reference.fact);
    }
    for (const cluster of named.values()) {
      units.push({
        entryId: entry.id,
        entryKind: "experience",
        title: capitalise(cluster.phrase),
        reference: `the ${cluster.phrase}`,
        source: own[0]?.source ?? `${entry.title} at ${entry.employer}`,
        label: `${entry.title} at ${entry.employer}`,
        order: own[0]?.parentOrder ?? 0,
        facts: cluster.facts,
      });
    }
  }
  profile.projects.forEach((project, index) => {
    const own = facts.filter((fact) => fact.parentId === project.id);
    if (own.length === 0) return;
    units.push({
      entryId: project.id,
      entryKind: "project",
      title: project.name,
      reference: project.name,
      source: `Project: ${project.name}`,
      label: `Project: ${project.name}`,
      order: profile.experience.length + index,
      facts: own,
    });
  });
  return units;
}

/** A criterion about how the work is done (testing, performance, ...) rather than what the role builds. */
function isPractice(matcher: RequirementMatcher): boolean {
  if (matcher.technical) return true;
  return (
    matcher.requirement.category !== "domain_knowledge" &&
    matcher.concepts.length > 0 &&
    matcher.concepts.every((group) => group.kind === "practice")
  );
}

/**
 * Weight of a criterion when choosing the project to show. What the product is
 * for counts most, what the role is hired to do next, engineering practice and
 * tools least: those are usually evidenced by the most recent role, which is
 * on the first page already.
 */
function criterionWeight(matcher: RequirementMatcher): number {
  if (matcher.technical) return 0.25;
  if (isPractice(matcher)) return 0.5;
  const requirement = matcher.requirement;
  let weight = requirement.classification === "mandatory" || requirement.priority === "high" ? 2 : 1;
  if (requirement.category === "domain_knowledge" || matcher.concepts.some((group) => group.kind === "domain")) {
    weight += 1;
  }
  return weight;
}

interface ScoredUnit {
  unit: ProjectUnit;
  score: number;
  roleShaped: boolean;
  criteria: string[];
  relevance: Map<string, number>;
}

function scoreUnit(unit: ProjectUnit, matchers: RequirementMatcher[]): ScoredUnit {
  let score = 0;
  let roleShaped = false;
  const criteria: string[] = [];
  const relevance = new Map<string, number>();
  for (const matcher of matchers) {
    const weight = criterionWeight(matcher);
    let best = 0;
    for (const fact of unit.facts) {
      const value = factScore(matcher, fact);
      if (value >= 1) relevance.set(fact.id, (relevance.get(fact.id) ?? 0) + value * weight);
      best = Math.max(best, value);
    }
    if (best < 1) continue;
    score += Math.min(best, 3) * weight;
    if (!isPractice(matcher)) {
      roleShaped = true;
      criteria.push(matcher.requirement.description);
    }
  }
  return { unit, score, roleShaped, criteria, relevance };
}

function toSelection(
  scored: ScoredUnit,
  profile: CareerProfileData,
  basis: FeaturedSelection["basis"] = "term",
): FeaturedSelection {
  const { unit, relevance } = scored;
  const statements = unit.facts
    .filter((fact) => fact.kind !== "project")
    .map((fact, index) => ({ fact, index, named: projectPhrase(fact.text)?.phrase.includes(" ") ?? false }))
    .sort(
      (a, b) =>
        Number(b.named) - Number(a.named) ||
        (relevance.get(b.fact.id) ?? 0) - (relevance.get(a.fact.id) ?? 0) ||
        a.index - b.index,
    )
    .slice(0, MAX_FEATURED_STATEMENTS)
    .map((item) => item.fact.id);
  return {
    entryId: unit.entryId,
    entryKind: unit.entryKind,
    title: unit.title,
    reference: unit.reference,
    source: unit.source,
    sourceIds: statements,
    placement: placementFor(unit.entryKind, unit.entryId, profile),
    criteria: scored.criteria.slice(0, 4),
    basis,
  };
}

/** Work in the most recent role is already at the top of page one; anything else gets its own short entry. */
function placementFor(
  entryKind: "experience" | "project",
  entryId: string,
  profile: CareerProfileData,
): FeaturedSelection["placement"] {
  return entryKind === "experience" && profile.experience[0]?.id === entryId ? "lead_role" : "selected_project";
}

/**
 * The strongest supported project for this role: the unit whose statements
 * speak to the most (and the most important) screening criteria. Returns null
 * when nothing in the profile speaks to what the role is about.
 */
export function selectFeaturedProject(
  profile: CareerProfileData,
  requirements: JobRequirement[],
): { selection: FeaturedSelection; unit: ProjectUnit } | null {
  const matchers = requirements.map(buildMatcher);
  const ranked = listProjectUnits(profile)
    .map((unit) => scoreUnit(unit, matchers))
    .filter((scored) => scored.roleShaped && scored.score >= 2)
    .sort((a, b) => b.score - a.score || a.unit.order - b.unit.order);
  const best = ranked[0];
  return best ? { selection: toSelection(best, profile), unit: best.unit } : null;
}

/**
 * One focused question about the selected project: the first thing a
 * screening criterion asks for that no confirmed statement states. Null when
 * nothing material is missing; the owner can always proceed without answering.
 */
export function deriveQuestion(
  criteria: BriefCriterion[],
  featured: FeaturedSelection | null,
): ClarifyingQuestion | null {
  if (!featured) return null;
  const reference = featured.reference || "this work";
  for (const criterion of criteria) {
    const signal = criterion.missingSignals.map((id) => getSignal(id)).find(Boolean);
    if (!signal) continue;
    return {
      text: signal.question(reference),
      hint: signal.hint,
      entryId: featured.entryId,
      entryKind: featured.entryKind,
      entryLabel: featured.source,
      signal: signal.id,
      criterion: criterion.description,
    };
  }
  return null;
}

/** Stage 2, before drafting: criteria, evidence across the whole profile, featured project, question. */
export function planApplication(input: {
  profile: CareerProfileData;
  analysis: JobAnalysis;
  jobText: string;
  now?: Date;
}): ApplicationPlan {
  const { profile, analysis } = input;
  const evidence = matchEvidence(profile, analysis);
  const screening = selectScreeningRequirements(analysis);
  const criteria: BriefCriterion[] = screening.map((requirement) => {
    const match = evidence.matches.find((candidate) => candidate.requirementId === requirement.id)!;
    return { ...match, category: requirement.category, priority: requirement.priority };
  });
  const featured = selectFeaturedProject(profile, screening);
  return {
    evidence,
    criteria,
    featured: featured?.selection ?? null,
    question: deriveQuestion(criteria, featured?.selection ?? null),
    context: buildApplicationContext(input.jobText, analysis),
    headlineIssues: headlineIssuesForProfile(profile, input.now),
  };
}

function cleanLine(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Fold the model's evidence plan into the deterministic one. The model may
 * point at statements the term matcher missed and may prefer another project,
 * but every id must exist in the confirmed profile, a criterion that asks for
 * stated evidence stays open until a cited statement states it, and technical
 * requirements are never upgraded on the model's say-so.
 */
export function reconcilePlan(
  plan: ApplicationPlan,
  model: TailoringAiOutput["evidencePlan"],
  profile: CareerProfileData,
  analysis: JobAnalysis,
): ApplicationPlan {
  const facts = listProfileFacts(profile);
  const byId = new Map(facts.map((fact) => [fact.id, fact]));

  const criteria = plan.criteria.map((criterion) => {
    const proposed = model.criteria.find((item) => item.requirementId === criterion.requirementId);
    if (!proposed) return criterion;
    const added = [...new Set(proposed.sourceIds)]
      .map((id) => byId.get(id))
      .filter((fact): fact is ProfileFact => Boolean(fact))
      .filter((fact) => !criterion.evidence.some((ref) => ref.id === fact.id));
    const requirement = analysis.requirements.find((item) => item.id === criterion.requirementId);
    const asked = signalsAsked(`${criterion.description} ${requirement?.supportingText ?? ""}`);
    const evidence = [...criterion.evidence, ...added.map((fact) => ({ ...factRef(fact), basis: "model" as const }))];
    const texts = evidence.map((ref) => byId.get(ref.id)?.text ?? "");
    const missingSignals = asked.filter((signal) => !texts.some((text) => signal.shows.test(text)));
    let status = criterion.status;
    if (!TECHNICAL.has(criterion.category) && added.length > 0) {
      if (status === "not_evidenced") status = "partially_supported";
      else if (status === "partially_supported" && missingSignals.length === 0) status = "supported";
    }
    if (missingSignals.length > 0 && status === "supported") status = "partially_supported";
    const missing =
      missingSignals.length > 0
        ? missingSignals.map((signal) => signal.gap).join(" ")
        : status === "supported"
          ? ""
          : cleanLine(proposed.gap, 300) || criterion.missing;
    return {
      ...criterion,
      status,
      evidence: evidence.slice(0, 8),
      missing,
      missingSignals: missingSignals.map((signal) => signal.id),
    };
  });

  let featured = plan.featured;
  const proposedEntry = model.featuredProject.entryId.trim();
  if (proposedEntry && proposedEntry !== plan.featured?.entryId) {
    const own = facts.filter((fact) => fact.parentId === proposedEntry);
    const cited = [...new Set(model.featuredProject.sourceIds)]
      .map((id) => byId.get(id))
      .filter(
        (fact): fact is ProfileFact => Boolean(fact) && fact!.parentId === proposedEntry && fact!.kind !== "project",
      )
      .slice(0, MAX_FEATURED_STATEMENTS);
    if (own.length > 0 && cited.length > 0) {
      const entryKind = own[0].parentKind;
      const project = profile.projects.find((item) => item.id === proposedEntry);
      const named = cited.map((fact) => projectPhrase(fact.text)).find((found) => found && /[ -]/.test(found.phrase));
      featured = {
        entryId: proposedEntry,
        entryKind,
        title: project?.name ?? groundedTitle(model.featuredProject.title, cited),
        reference: project?.name ?? (named ? `the ${named.phrase}` : "this work"),
        source: own[0].source,
        sourceIds: cited.map((fact) => fact.id),
        placement: placementFor(entryKind, proposedEntry, profile),
        criteria: criteria
          .filter((criterion) => criterion.evidence.some((ref) => ref.parentId === proposedEntry))
          .map((criterion) => criterion.description)
          .slice(0, 4),
        basis: "model",
      };
    }
  }

  const open = criteria.some((criterion) => criterion.status !== "supported");
  let question = deriveQuestion(criteria, featured);
  const asked = cleanLine(model.question.text, 240);
  const target = facts.find((fact) => fact.parentId === model.question.entryId.trim());
  if (
    open &&
    target &&
    asked.endsWith("?") &&
    asked.length >= 15 &&
    (!featured || featured.entryId === target.parentId)
  ) {
    question = {
      text: asked,
      hint: question?.hint ?? "",
      entryId: target.parentId,
      entryKind: target.parentKind,
      entryLabel: target.source,
      signal: "",
      criterion: question?.criterion ?? "",
    };
  }

  const evidence: EvidenceMap = {
    matches: plan.evidence.matches.map((match) => {
      const updated = criteria.find((criterion) => criterion.requirementId === match.requirementId);
      return updated
        ? {
            ...match,
            status: updated.status,
            evidence: updated.evidence,
            missing: updated.missing,
            missingSignals: updated.missingSignals,
          }
        : match;
    }),
  };
  return { ...plan, evidence, criteria, featured, question };
}

/** A model-suggested project title is kept only when every word of it comes from the cited statements. */
function groundedTitle(title: string, cited: ProfileFact[]): string {
  const proposed = cleanLine(title, 80);
  const stems = stemSet(cited.map((fact) => fact.text).join(" "));
  const grounded = proposed && [...stemSet(proposed)].every((value) => value.length <= 2 || stems.has(value));
  if (grounded) return proposed;
  for (const fact of cited) {
    const found = projectPhrase(fact.text);
    if (found && /[ -]/.test(found.phrase)) return capitalise(found.phrase);
  }
  return "";
}

export function toBrief(plan: ApplicationPlan): ApplicationBrief {
  return {
    criteria: plan.criteria,
    featured: plan.featured,
    question: plan.question,
    applicationRequirements: plan.context.applicationRequirements,
    logistics: plan.context.logistics,
    eligibility: plan.context.eligibility,
    headlineIssues: plan.headlineIssues,
  };
}
