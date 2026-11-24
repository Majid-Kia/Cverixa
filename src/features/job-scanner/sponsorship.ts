import { isVerbatim, splitSentences } from "@/features/job-analysis/application-context";
import type { RelocationStatus, SponsorshipStatus } from "./constants";

/**
 * Visa sponsorship, relocation support and work-authorisation requirements of
 * one posting, each with the text that supports it. Everything here is derived
 * from what the posting (or the source that listed it) says about this job.
 * A posting that is silent is `unknown`; nothing is inferred from the company,
 * the country or the kind of role.
 */
export interface Evidence {
  /** The sentence from the posting, or a description of the source's own flag. */
  text: string;
  /**
   * posting_text: matched by the rules below. ai_quote: quoted by the AI and
   * verified to be in the posting word for word. source_flag: the job board
   * lists the posting under visa sponsorship. relocation_signal: the posting
   * offers relocation support, which is related but is not sponsorship.
   */
  basis: "posting_text" | "ai_quote" | "source_flag" | "relocation_signal";
  /** What the statement was read as. */
  reading: "offers" | "excludes" | "uncertain" | "requires_authorization";
  /** The posting the statement comes from. */
  sourceUrl: string;
}

export interface VisaSupport {
  sponsorship: { status: SponsorshipStatus; evidence: Evidence[] };
  relocation: { status: RelocationStatus; evidence: Evidence[] };
  workAuthorization: { required: boolean; evidence: Evidence[] };
}

const TOPIC =
  "visas?|work permits?|blue card|residence permits?|skilled worker|kennismigrant|highly skilled migrant|immigration|sponsorship|visum|arbeitserlaubnis";
const SPONSOR_TOPIC = new RegExp(`\\b(${TOPIC}|sponsor\\w*)\\b`, "i");

/** "Visa" next to card networks is the payment brand, not an immigration document. */
const CARD_CONTEXT =
  /\b(mastercard|amex|american express|maestro|card (schemes?|networks?|brands?|payments?)|credit cards?|debit cards?|paypal|acquir\w+|issuing|issuer|payment methods?)\b/i;
const IMMIGRATION_CONTEXT =
  /\b(sponsor\w*|work permits?|relocat\w+|immigration|blue card|right to work|authori[sz]\w+|residence permit|citizen\w*)\b/i;

/** The employer says it does not sponsor. */
const EXCLUDES: RegExp[] = [
  /\b(unable|not able|cannot|can ?not|can['’]t|do(es)? not|don['’]t|doesn['’]t|will not|won['’]t|are not|aren['’]t|is not|isn['’]t|not currently|no longer|not in a position)\b[^.]{0,70}\b(sponsor\w*|visas?|work permits?)\b/i,
  /\b(no|without)\b[^.]{0,30}\b(sponsorship|visa (support|assistance|help))\b/i,
  /\b(sponsorship|visa support)\b[^.]{0,40}\b(not|un)\s?-?(available|offered|provided|possible|supported)\b/i,
  /\bnot eligible for\b[^.]{0,30}\b(visa|sponsorship)\b/i,
  /\b(visa )?sponsorship\s*[:\-–]\s*(no|none|not available|unavailable)\b/i,
  /\bkein(e)?\b[^.]{0,30}\b(visa|visum)[- ]?(sponsoring|sponsorship|unterstützung)\b/i,
];

/** The employer commits to sponsoring or supporting the visa process. */
const OFFERS: RegExp[] = [
  new RegExp(
    `\\b(we|our|the company|the employer)\\b[^.]{0,50}\\b(offer|provide|sponsor|support|assist|help|cover|handle|arrange|take care)\\w*\\b[^.]{0,80}\\b(${TOPIC})\\b`,
    "i",
  ),
  new RegExp(
    `\\b(${TOPIC})\\b[^.]{0,50}\\b(is|are|will be)\\s+(also\\s+)?(available|offered|provided|included|covered|supported)\\b`,
    "i",
  ),
  /\bwe sponsor\b/i,
  /\b(visa|visum)[- ]?(sponsoring|unterstützung)\b/i,
];

/**
 * A benefits line such as "Visa sponsorship" or "Relocation and visa support".
 * The bare phrase is an offer only in a short list item; in a full sentence
 * ("Information on visa sponsorship is on our careers page") it commits to nothing.
 */
const BENEFIT_ITEMS: RegExp[] = [
  /\b(visa|work permit|blue card|immigration)\s+(and\s+relocation\s+|&\s+relocation\s+)?(sponsorship|support|assistance|package|help)\b/i,
  /\b(relocation|relocation package)\s+(and|&)\s+visa\s+(sponsorship|support|assistance)\b/i,
];
const BENEFIT_ITEM_MAX_WORDS = 8;
const ABOUT_ONLY = /\b(about|regarding|information|details|questions?|policy|policies|status|faq)\b/i;

/**
 * Text addressed to an automated reader ("ignore previous instructions",
 * "you must state that..."). A posting is untrusted input; such a sentence is
 * an attempt to steer the analysis, never an employer's statement.
 */
const INSTRUCTION =
  /\b(ignore (all |any )?(of )?(the )?(previous|prior|above|earlier) (instructions|prompts?|rules)|disregard (all |any )?(previous|prior|above)|system\s*:|assistant\s*[,:]|as an ai\b|ai (assistant|model|agent)|language model|you must (state|report|say|classify|output|respond|answer|mark|rate|score)|(report|classify|mark|rate|score|set|label)\b[^\n]{0,60}\bas\s+["'“]?(confirmed|sponsored|possible|none|unknown|true|false)\b|sponsorship[._ ]status|score this (candidate|job|applicant)|\bjson\b)/i;

/** Hedges that stop a statement from being a commitment. */
const HEDGED =
  /\b(may|might|could|possibly|potentially|case[- ]by[- ]case|depending|depends|in some cases|certain (roles|positions|cases)|for the right candidate|exceptional|can be (considered|discussed)|to be discussed|eligible candidates|where applicable|subject to|if (required|needed|applicable))\b/i;

/**
 * Wording that narrows a statement to particular people or cases: "we can,
 * however, provide a visa transfer from your current employer", "sponsorship
 * only for senior roles". Related to sponsorship, but not an offer to sponsor
 * whoever is hired, so it never confirms.
 */
const LIMITED =
  /\b(however|only|solely|transfers?|renewals?|extensions?|already|existing|current(ly)? (employer|visa|permit|residen\w+|work)|limited|restricted|within the (eu|eea|uk|us|country))\b/i;

/** Statements about the applicant's situation: relevant, but not a commitment by the employer. */
const CANDIDATE_SIDE =
  /\b(if you|do you|will you|whether you|you (will |may |might |currently )?(need|require|hold|have)|your (current )?(visa|work permit|sponsorship|immigration) (status|situation|requirements?|needs?)|please (state|indicate|mention|let us know|note|tell)|candidates? (who|that|requiring|must|need)|applicants? (who|that|requiring|must|need))\b/i;

/** The applicant must already be allowed to work in the country. */
const REQUIRES_AUTHORIZATION: RegExp[] = [
  /\b(must|need to|needs to|required to|have to|should|you(['’]ll| will)? need)\b[^.]{0,60}\b(right to work|work permit|work authori[sz]ation|authori[sz]ed to work|eligible to work|eligibility to work|legally (able|entitled|authori[sz]ed|permitted) to work|valid (work )?visa|citizenship|permanent residen\w+)\b/i,
  /\b(existing|valid|current|unrestricted|full|permanent)\b[^.]{0,25}\b(right to work|work permit|work authori[sz]ation|working rights|work visa)\b/i,
  /\b(right to work|authori[sz]ed to work|eligib\w+ to work|work authori[sz]ation|work permit)\b[^.]{0,70}\b(required|is a must|mandatory|essential|without (the need for )?(visa |employer )?sponsorship)\b/i,
  /\b(only|exclusively)\b[^.]{0,50}\b(eu|eea|uk|us|u\.s\.|swiss|canadian)\b[^.]{0,25}\b(citizens?|residents?|nationals?|passport|work permit)\b/i,
  /\b(eu|eea|uk|us|u\.s\.|swiss)\b[^.]{0,15}\b(citizenship|passport|work permit)\b[^.]{0,30}\b(required|is a must|mandatory|only)\b/i,
  /\bapplicants must be (currently )?(authori[sz]ed|eligible|legally)\b/i,
];

const RELOCATION = /\b(relocat\w+|umzug\w*)\b/i;
/** The applicant's obligation to move, which is not support from the employer. */
const RELOCATION_OBLIGATION =
  /\b(willing(ness)?|open|able|prepared|ready|must|need|required|expected)\b[^.]{0,25}\b(to )?relocat\w+\b/i;
/** Relocation named as something the employer gives: a package, a covered cost, help with the move. */
const RELOCATION_OFFER: RegExp[] = [
  /\brelocation\s+(package|support|assistance|bonus|allowance|budget|help|benefits?|costs?|expenses|services?)\b/i,
  /\brelocation\s+(and|&)\s+visa\s+(support|assistance|sponsorship)\b/i,
  /\bvisa\s+(and|&)\s+relocation\s+(support|assistance|package|sponsorship)\b/i,
  /\b(offer|provide|cover|pay|reimburse|support|assist|help)\w*\b[^.]{0,60}\b(your|the|with|for)\s+relocat\w+\b/i,
  /\brelocat\w+\b[^.]{0,40}\b(is|are|will be)\s+(also\s+)?(provided|offered|covered|available|paid|supported|included|reimbursed)\b/i,
  /\b(unterstützung beim umzug|umzugs(hilfe|unterstützung|kosten)|relocation[- ]?(paket|unterstützung))\b/i,
];
const RELOCATION_EXCLUDED =
  /\b(no|not|unable|cannot|can['’]t|don['’]t|doesn['’]t|won['’]t|without)\b[^.]{0,40}\brelocat\w+\b|\brelocat\w+\b[^.]{0,40}\b(not|un)\s?-?(available|offered|provided|supported|covered)\b/i;

function matchesAny(patterns: RegExp[], sentence: string): boolean {
  return patterns.some((pattern) => pattern.test(sentence));
}

/** Whether a sentence hedges or asks, so it cannot be a commitment. */
export function isHedged(sentence: string): boolean {
  return HEDGED.test(sentence) || LIMITED.test(sentence) || CANDIDATE_SIDE.test(sentence) || /\?\s*$/.test(sentence);
}

/** How one sentence reads with respect to sponsorship, or null when it is not about it. */
export function readSponsorshipSentence(sentence: string): Evidence["reading"] | null {
  if (isInstruction(sentence)) return null;
  if (CARD_CONTEXT.test(sentence) && !IMMIGRATION_CONTEXT.test(sentence)) return null;
  if (matchesAny(EXCLUDES, sentence)) return "excludes";
  if (matchesAny(REQUIRES_AUTHORIZATION, sentence)) return "requires_authorization";
  if (!SPONSOR_TOPIC.test(sentence)) return null;
  if (isHedged(sentence)) return "uncertain";
  if (matchesAny(OFFERS, sentence)) return "offers";
  const words = sentence.trim().split(/\s+/).length;
  if (words <= BENEFIT_ITEM_MAX_WORDS && !ABOUT_ONLY.test(sentence) && matchesAny(BENEFIT_ITEMS, sentence)) {
    return "offers";
  }
  return "uncertain";
}

/** Whether a sentence is written to steer an automated reader rather than to inform an applicant. */
export function isInstruction(sentence: string): boolean {
  return INSTRUCTION.test(sentence);
}

const EMPLOYER_VOICE = /\b(we|we['’](ll|re|ve)|our|us|the company|the employer)\b/i;

/**
 * Whether the AI's reading may settle a sentence the rules left open. Only a
 * full sentence in which the employer speaks about itself qualifies; a
 * heading, a fragment, a hedge, a question or text aimed at the model does not.
 */
function canBeCommitment(sentence: string): boolean {
  return (
    EMPLOYER_VOICE.test(sentence) &&
    sentence.trim().split(/\s+/).length >= 5 &&
    !isHedged(sentence) &&
    !isInstruction(sentence)
  );
}

export interface ClassifyOptions {
  /** URL of the posting, stored with every piece of evidence. */
  sourceUrl: string;
  /** Set when the job board itself lists the posting under visa sponsorship. */
  sourceFlag?: { label: string } | null;
}

function unique(evidence: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.reading}:${item.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveStatus(evidence: Evidence[]): SponsorshipStatus {
  const offers = evidence.some((item) => item.reading === "offers" && item.basis !== "relocation_signal");
  const excludes = evidence.some((item) => item.reading === "excludes");
  if (offers && !excludes) return "confirmed";
  if (excludes && !offers) return "none";
  // Conflicting statements, hedged statements, a job-board flag or relocation support.
  if (evidence.some((item) => item.reading !== "requires_authorization")) return "possible";
  return "unknown";
}

/**
 * Deterministic classification from the posting text. `confirmed` needs a
 * sentence in which the employer commits to sponsorship; `none` needs one that
 * rules it out. A job-board flag or an offer of relocation support is related
 * evidence and yields `possible`, never `confirmed`.
 */
export function classifyVisaSupport(text: string, options: ClassifyOptions): VisaSupport {
  const sponsorship: Evidence[] = [];
  const relocation: Evidence[] = [];
  const authorization: Evidence[] = [];
  let relocationOffered = false;
  let relocationExcluded = false;

  for (const sentence of splitSentences(text)) {
    const reading = readSponsorshipSentence(sentence);
    if (reading === "requires_authorization") {
      authorization.push({ text: sentence, basis: "posting_text", reading, sourceUrl: options.sourceUrl });
    } else if (reading) {
      sponsorship.push({ text: sentence, basis: "posting_text", reading, sourceUrl: options.sourceUrl });
      // "Must be able to work without sponsorship" both excludes sponsorship and requires authorisation.
      if (reading === "excludes" && matchesAny(REQUIRES_AUTHORIZATION, sentence)) {
        authorization.push({
          text: sentence,
          basis: "posting_text",
          reading: "requires_authorization",
          sourceUrl: options.sourceUrl,
        });
      }
    }

    if (RELOCATION.test(sentence) && !isInstruction(sentence)) {
      if (RELOCATION_EXCLUDED.test(sentence)) {
        relocationExcluded = true;
        relocation.push({ text: sentence, basis: "posting_text", reading: "excludes", sourceUrl: options.sourceUrl });
      } else if (
        !RELOCATION_OBLIGATION.test(sentence) &&
        !isHedged(sentence) &&
        matchesAny(RELOCATION_OFFER, sentence)
      ) {
        relocationOffered = true;
        relocation.push({ text: sentence, basis: "posting_text", reading: "offers", sourceUrl: options.sourceUrl });
      }
    }
  }

  if (options.sourceFlag) {
    sponsorship.push({
      text: `${options.sourceFlag.label} lists this posting under visa sponsorship. The posting text does not confirm it.`,
      basis: "source_flag",
      reading: "uncertain",
      sourceUrl: options.sourceUrl,
    });
  }
  const relocationStatus: RelocationStatus = relocationOffered
    ? "offered"
    : relocationExcluded
      ? "not_offered"
      : "unknown";
  if (relocationStatus === "offered" && !sponsorship.some((item) => item.basis === "posting_text")) {
    const first = relocation.find((item) => item.reading === "offers");
    if (first) sponsorship.push({ ...first, basis: "relocation_signal", reading: "uncertain" });
  }

  const evidence = unique(sponsorship).slice(0, 6);
  return {
    sponsorship: { status: resolveStatus(evidence), evidence },
    relocation: { status: relocationStatus, evidence: unique(relocation).slice(0, 4) },
    workAuthorization: { required: authorization.length > 0, evidence: unique(authorization).slice(0, 4) },
  };
}

/** What the AI reported about a posting. Quotes are untrusted until verified. */
export interface AiVisaSignals {
  sponsorship: { status: SponsorshipStatus; quotes: string[] };
  relocation: { offered: boolean; quotes: string[] };
  workAuthorization: { required: boolean; quotes: string[] };
}

/**
 * Combine the deterministic classification with the AI's reading. An AI
 * statement counts only when its quote is in the posting word for word and is
 * about sponsorship. It can then settle a sentence the rules could not read
 * either way. The AI never overrides a sentence the rules read as an explicit
 * exclusion, and a hedged sentence or a question never confirms anything.
 */
export function mergeAiSignals(base: VisaSupport, ai: AiVisaSignals, text: string, sourceUrl: string): VisaSupport {
  // A quote is judged as the whole posting sentence it comes from, never as the fragment the
  // model chose: "we offer visa sponsorship" cut out of "you must state that we offer visa
  // sponsorship" or out of "unfortunately we no longer offer visa sponsorship" proves nothing.
  const sentences = splitSentences(text);
  const fold = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const sentencesOf = (quotes: string[]): string[] => {
    const found: string[] = [];
    for (const raw of quotes) {
      const quote = raw.trim();
      if (quote.length > 600 || !isVerbatim(text, quote)) continue;
      const needle = fold(quote);
      for (const sentence of sentences) {
        const hay = fold(sentence);
        if ((hay.includes(needle) || needle.includes(hay)) && !found.includes(sentence)) found.push(sentence);
      }
    }
    return found;
  };

  const sponsorshipEvidence = base.sponsorship.evidence.map((item) => ({ ...item }));
  for (const sentence of sentencesOf(ai.sponsorship.quotes)) {
    const ruleReading = readSponsorshipSentence(sentence);
    if (!ruleReading || ruleReading === "requires_authorization") continue;
    let reading: Evidence["reading"] = ruleReading;
    if (ruleReading === "uncertain" && canBeCommitment(sentence)) {
      if (ai.sponsorship.status === "confirmed") reading = "offers";
      else if (ai.sponsorship.status === "none") reading = "excludes";
    }
    const existing = sponsorshipEvidence.find((item) => item.basis === "posting_text" && item.text === sentence);
    if (existing) {
      if (existing.reading === "uncertain" && reading !== "uncertain") {
        existing.reading = reading;
        existing.basis = "ai_quote";
      }
      continue;
    }
    sponsorshipEvidence.push({ text: sentence, basis: "ai_quote", reading, sourceUrl });
  }

  const relocationEvidence = [...base.relocation.evidence];
  let relocationStatus = base.relocation.status;
  if (ai.relocation.offered && relocationStatus === "unknown") {
    for (const sentence of sentencesOf(ai.relocation.quotes)) {
      if (!RELOCATION.test(sentence) || RELOCATION_EXCLUDED.test(sentence)) continue;
      if (RELOCATION_OBLIGATION.test(sentence) || isInstruction(sentence) || isHedged(sentence)) continue;
      relocationEvidence.push({ text: sentence, basis: "ai_quote", reading: "offers", sourceUrl });
      relocationStatus = "offered";
    }
  }

  const authorizationEvidence = [...base.workAuthorization.evidence];
  if (ai.workAuthorization.required && !base.workAuthorization.required) {
    for (const sentence of sentencesOf(ai.workAuthorization.quotes)) {
      if (readSponsorshipSentence(sentence) !== "requires_authorization") continue;
      authorizationEvidence.push({ text: sentence, basis: "ai_quote", reading: "requires_authorization", sourceUrl });
    }
  }

  const evidence = unique(sponsorshipEvidence).slice(0, 8);
  return {
    sponsorship: { status: resolveStatus(evidence), evidence },
    relocation: { status: relocationStatus, evidence: unique(relocationEvidence).slice(0, 4) },
    workAuthorization: {
      required: authorizationEvidence.length > 0,
      evidence: unique(authorizationEvidence).slice(0, 4),
    },
  };
}
