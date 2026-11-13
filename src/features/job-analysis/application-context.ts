import type {
  ApplicationRequirement,
  ApplicationRequirementKind,
  Eligibility,
  JobAnalysis,
  LogisticsItem,
  LogisticsKind,
} from "./schema";

/**
 * What a posting asks of the applicant beyond the resume itself: things to
 * submit, where the work happens, and whether sponsorship or eligibility is
 * mentioned at all. Everything here is quoted from the posting; nothing is
 * inferred from the company, the location or the candidate.
 */
export interface ApplicationContext {
  applicationRequirements: ApplicationRequirement[];
  logistics: LogisticsItem[];
  eligibility: Eligibility;
}

const APPLY_CUE =
  /\b(apply|applying|application|include|send|share|attach|submit|tell us|let us know|answer|with your (cv|resume|résumé))\b/i;

const APPLICATION_RULES: Array<{ kind: ApplicationRequirementKind; pattern: RegExp; needsCue: boolean }> = [
  { kind: "cover_letter", pattern: /\bcover(ing)? letter\b/i, needsCue: false },
  {
    kind: "project_note",
    pattern:
      /\b(hardest|toughest|proudest|most (challenging|difficult|complex|interesting|proud))\b.{0,80}\b(built|build|shipped|made|created|worked on|project|thing)\b/i,
    needsCue: false,
  },
  {
    kind: "project_note",
    pattern:
      /\b(short|brief|quick|few (lines|sentences|words)|couple of (lines|sentences)|paragraph)\b.{0,60}\b(note|description|write[- ]?up|about|on)\b/i,
    needsCue: true,
  },
  {
    kind: "portfolio",
    pattern:
      /\byour portfolio\b|\b(link to|include|share|send|attach|submit) (us )?(a |your )?portfolio\b|\bportfolio (link|url|site|website|of (your )?(work|projects)|is required|required)\b|\bwork samples?\b|\bsamples? of (your )?work\b|\blinks? to (your )?(work|projects|things you(['’]ve| have) (built|made|shipped))\b/i,
    needsCue: false,
  },
  {
    kind: "application_question",
    pattern:
      /\b(answer|respond to|responses? to)\b.{0,60}\b(questions?|prompts?)\b|\bapplication questions?\b|\bin your application,? (please )?(tell|describe|explain|answer|mention)\b/i,
    needsCue: false,
  },
];

const OFFICE =
  /\b(hybrid|on[- ]?site|in[- ]office|in[- ]person|office[- ]based|(in|from|at) (the|our) [\w ,]{0,30}office|days? (a|per|each) week|remote[- ]first|fully remote|remote (within|from|in|across)|commut\w+|time ?zones?)\b/i;
const BASED_IN = /\b(based|located) in\b/i;
const BASED_IN_SUBJECT = /\b(you|role|position|candidates?|must|need|require\w*|office)\b/i;
const RELOCATION = /\brelocat\w+/i;
const ELIGIBILITY =
  /\bvisa\b|\bsponsorship\b|\bsponsor\w*\b.{0,40}\b(visa|work|permit|employment)\b|\bwork (permit|authori[sz]ation)\b|\bright to work\b|\bauthori[sz]ed to work\b|\beligib\w+ to work\b|\blegally (able|entitled|authori[sz]ed) to work\b|\bcitizenship\b|\bsecurity clearance\b/i;

/** Split a posting into sentences, dropping list markers. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·–—]|\d+[.)])\s+/, "").trim())
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12 && sentence.length <= 600);
}

function normalizeQuote(value: string): string {
  return value.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

/** Whether `quote` appears in `text` word for word (ignoring case, spacing and quote style). */
export function isVerbatim(text: string, quote: string): boolean {
  const needle = normalizeQuote(quote);
  return needle.length >= 8 && normalizeQuote(text).includes(needle);
}

function sameQuote(a: string, b: string): boolean {
  const left = normalizeQuote(a);
  const right = normalizeQuote(b);
  return left.includes(right) || right.includes(left);
}

/** Deterministic extraction from the posting text. Used on its own and as a safety net for model output. */
export function extractApplicationContext(text: string): ApplicationContext {
  const applicationRequirements: ApplicationRequirement[] = [];
  const logistics: LogisticsItem[] = [];
  const eligibilityStatements: string[] = [];

  for (const sentence of splitSentences(text)) {
    // One sentence can ask for several things ("a portfolio and a cover letter").
    const kinds = new Set(
      APPLICATION_RULES.filter(
        (candidate) => candidate.pattern.test(sentence) && (!candidate.needsCue || APPLY_CUE.test(sentence)),
      ).map((candidate) => candidate.kind),
    );
    for (const kind of kinds) {
      if (applicationRequirements.some((item) => item.kind === kind && sameQuote(item.supportingText, sentence))) {
        continue;
      }
      applicationRequirements.push({
        id: `apply_${applicationRequirements.length + 1}`,
        kind,
        description: sentence,
        supportingText: sentence,
      });
    }

    let kind: LogisticsKind | null = null;
    if (RELOCATION.test(sentence)) kind = "relocation";
    else if (OFFICE.test(sentence) || (BASED_IN.test(sentence) && BASED_IN_SUBJECT.test(sentence))) kind = "office";
    if (kind && !logistics.some((item) => sameQuote(item.supportingText, sentence))) {
      logistics.push({
        id: `logistics_${logistics.length + 1}`,
        kind,
        description: sentence,
        supportingText: sentence,
      });
    }

    if (ELIGIBILITY.test(sentence) && !eligibilityStatements.includes(sentence)) eligibilityStatements.push(sentence);
  }

  return {
    applicationRequirements,
    logistics,
    eligibility: {
      status: eligibilityStatements.length > 0 ? "stated" : "unknown",
      statements: eligibilityStatements.slice(0, 5),
    },
  };
}

/**
 * Combine the deterministic extraction with model-extracted items. A model
 * item is kept only when its supporting text is verbatim in the posting and it
 * does not repeat something already found. Eligibility is never taken from
 * the model: when the posting is silent it stays unknown.
 */
export function buildApplicationContext(text: string, analysis: JobAnalysis | null): ApplicationContext {
  const context = extractApplicationContext(text);
  for (const item of analysis?.applicationRequirements ?? []) {
    if (!isVerbatim(text, item.supportingText)) continue;
    if (
      context.applicationRequirements.some(
        (known) => known.kind === item.kind && sameQuote(known.supportingText, item.supportingText),
      )
    ) {
      continue;
    }
    context.applicationRequirements.push(item);
  }
  for (const item of analysis?.logistics ?? []) {
    if (!isVerbatim(text, item.supportingText)) continue;
    if (context.logistics.some((known) => sameQuote(known.supportingText, item.supportingText))) continue;
    context.logistics.push(item);
  }
  return context;
}
