import type { CareerProfileData } from "@/features/career-profile/schema";
import { normalizeTerm, TECH_KEYWORDS } from "@/features/job-analysis/keywords";
import type { JobAnalysis } from "@/features/job-analysis/schema";
import type { ApplicationPlan } from "@/features/resume-tailoring/application-brief";
import { isNamedTechnology, listProfileFacts } from "@/features/resume-tailoring/evidence";
import {
  checkTextAgainstSources,
  SourceIndex,
  type ClaimCheckContext,
} from "@/features/resume-tailoring/validate-claims";
import type { CoverLetterAiOutput, CoverLetterReport } from "./schema";

export const DEFAULT_GREETING = "Dear Hiring Manager,";
export const SIGN_OFF = "Sincerely,";
const MAX_PARAGRAPHS = 5;
const MAX_PARAGRAPH_LENGTH = 1500;
const MIN_PARAGRAPHS = 2;

/** What the model is given about the job and the evidence, and what the mock provider reads. */
export interface CoverLetterContext {
  jobTitle: string;
  company: string;
  candidateName: string;
  /** Screening criteria with the confirmed statements that support each. */
  criteria: Array<{
    description: string;
    status: string;
    evidence: Array<{ id: string; text: string; source: string }>;
  }>;
  /** The project the resume brings forward for this job, if any. */
  featuredProject: { title: string; source: string; statements: Array<{ id: string; text: string }> } | null;
  /** Verbatim sentences in which the posting asks applicants to send or answer something. */
  postingAsks: string[];
}

/** Evidence for the letter, taken from the same plan the resume is tailored from. */
export function buildCoverLetterContext(input: {
  profile: CareerProfileData;
  plan: ApplicationPlan;
  jobTitle: string;
  company: string;
}): CoverLetterContext {
  const facts = new Map(listProfileFacts(input.profile).map((fact) => [fact.id, fact]));
  const featured = input.plan.featured;
  return {
    jobTitle: input.jobTitle,
    company: input.company,
    candidateName: input.profile.personal.fullName,
    criteria: input.plan.criteria.map((criterion) => ({
      description: criterion.description,
      status: criterion.status,
      evidence: criterion.evidence
        .map((ref) => facts.get(ref.id))
        .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact))
        .slice(0, 4)
        .map((fact) => ({ id: fact.id, text: fact.text, source: fact.parentLabel })),
    })),
    featuredProject: featured
      ? {
          title: featured.title,
          source: featured.source,
          statements: featured.sourceIds
            .map((id) => facts.get(id))
            .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact))
            .map((fact) => ({ id: fact.id, text: fact.text })),
        }
      : null,
    postingAsks: input.plan.context.applicationRequirements
      .map((item) => item.supportingText || item.description)
      .filter(Boolean),
  };
}

/** Sentences of a paragraph, keeping their punctuation. */
function sentencesOf(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Technologies whose mention must be backed by the profile: the known
 * technical vocabulary plus the tools this posting names. Phrases that only
 * describe the work ("frontend applications") may be echoed freely.
 */
function letterTerms(analysis: JobAnalysis): string[] {
  const named = analysis.requirements.flatMap((requirement) => requirement.relatedSkills).filter(isNamedTechnology);
  const unique = new Set<string>();
  for (const term of [...named, ...TECH_KEYWORDS].map((value) => normalizeTerm(value))) {
    if (term.length >= 3 || term === "c#" || term === "go") unique.add(term);
  }
  return [...unique];
}

/** A model greeting is kept only when any name in it comes from the posting. */
function safeGreeting(greeting: string, known: string): string {
  const value = greeting
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,:;.]+$/, "");
  if (!/^(dear|hello|hi)\b/i.test(value) || value.length > 80) return DEFAULT_GREETING;
  const generic = new Set(["dear", "hello", "hi", "hiring", "manager", "team", "the", "recruiting", "recruitment"]);
  const haystack = known.toLowerCase();
  const grounded = value
    .split(/[^A-Za-z'’-]+/)
    .filter(Boolean)
    .every((word) => generic.has(word.toLowerCase()) || haystack.includes(word.toLowerCase()));
  return grounded ? `${value},` : DEFAULT_GREETING;
}

export interface BuiltCoverLetter {
  /** Greeting, paragraphs, sign-off and name, separated by blank lines. Null when too little survived. */
  body: string | null;
  report: CoverLetterReport;
}

/**
 * Turn the model's paragraphs into the letter. Every sentence is checked
 * against the confirmed profile the way resume claims are: numbers and named
 * technologies must appear in it, and customer contact, usage tracking, design
 * ownership or AI work must be stated by it. A sentence that fails is removed
 * and reported, never rewritten.
 */
export function buildCoverLetter(input: {
  profile: CareerProfileData;
  analysis: JobAnalysis;
  plan: ApplicationPlan;
  jobText: string;
  jobTitle: string;
  company: string;
  aiOutput: CoverLetterAiOutput;
}): BuiltCoverLetter {
  const index = new SourceIndex(input.profile);
  const context: ClaimCheckContext = { index, terms: letterTerms(input.analysis) };
  const personal = input.profile.personal;
  const dates = input.profile.experience.map((entry) => `${entry.startDate} ${entry.endDate}`).join(" ");
  const profileText = `${index.allText()} \n ${personal.headline} \n ${dates}`;

  // Naming the role and the company is not a claim about the candidate ("the React Developer
  // role at 7shifts"), so those words are left out of the check.
  const named = [input.jobTitle, input.company]
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)
    .map((value) => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"));
  const claimsOf = (sentence: string) => named.reduce((text, pattern) => text.replace(pattern, " "), sentence);

  const removed: CoverLetterReport["removed"] = [];
  const paragraphs: string[] = [];
  const seen = new Set<string>();
  for (const paragraph of input.aiOutput.paragraphs.slice(0, MAX_PARAGRAPHS + 2)) {
    const text = paragraph.text.replace(/\s+/g, " ").trim().slice(0, MAX_PARAGRAPH_LENGTH);
    if (!text) continue;
    const kept: string[] = [];
    for (const sentence of sentencesOf(text)) {
      const key = normalizeTerm(sentence);
      if (seen.has(key)) continue;
      seen.add(key);
      const reason = /https?:\/\/|www\.|<[a-z/]/i.test(sentence)
        ? "Links and markup are not allowed in the letter."
        : checkTextAgainstSources(claimsOf(sentence), profileText, null, context);
      if (reason) removed.push({ text: sentence, reason });
      else kept.push(sentence);
    }
    if (kept.length > 0 && paragraphs.length < MAX_PARAGRAPHS) paragraphs.push(kept.join(" "));
  }

  const report: CoverLetterReport = {
    removed,
    notClaimed: input.plan.criteria
      .filter((criterion) => criterion.status !== "supported")
      .map((criterion) => criterion.description),
    postingAsks: input.plan.context.applicationRequirements
      .map((item) => item.supportingText || item.description)
      .filter(Boolean),
  };
  if (paragraphs.length < MIN_PARAGRAPHS) return { body: null, report };

  const greeting = safeGreeting(input.aiOutput.greeting, `${input.jobText} ${input.company}`);
  const signature = personal.fullName.trim() ? `${SIGN_OFF}\n${personal.fullName.trim()}` : SIGN_OFF;
  return { body: [greeting, ...paragraphs, signature].join("\n\n"), report };
}
