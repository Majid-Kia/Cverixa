/**
 * Kinds of evidence that must be stated outright and are never inferred from
 * related experience: talking to customers, tracking usage, acting on
 * feedback, owning design decisions, building AI features.
 *
 * Each signal is used in three places:
 * - `asks`  : does a screening criterion call for this kind of evidence?
 * - `shows` : does a confirmed statement (or a generated claim) state it?
 * - `question`: what to ask the owner when a relevant project lacks it.
 *
 * A criterion that asks for a signal is only fully supported when a confirmed
 * statement shows it, and a generated bullet that shows a signal is rejected
 * unless its cited source shows it too.
 */
export interface EvidenceSignal {
  id: "customer_contact" | "usage_measurement" | "feedback_iteration" | "design_ownership" | "ai_features";
  /** Short noun phrase used in rejection reasons, e.g. "direct customer contact". */
  label: string;
  asks: RegExp;
  shows: RegExp;
  /** Shown next to a criterion when nothing in the profile states this. */
  gap: string;
  question: (project: string) => string;
  /** What a useful answer contains. */
  hint: string;
}

const PEOPLE = "(?:customers?|users?|clients?|merchants?|analysts?|operators?|agents?|end[- ]users?)";

export const EVIDENCE_SIGNALS: EvidenceSignal[] = [
  {
    id: "customer_contact",
    label: "direct contact with customers or users",
    asks: new RegExp(
      [
        `\\b(?:directly|closely|face[- ]to[- ]face)\\s+with\\s+(?:our\\s+|the\\s+)?${PEOPLE}`,
        `\\b(?:customer|user)[- ](?:facing|interviews?|research|discovery|calls?|visits?|conversations?)\\b`,
        `\\b(?:talk|speak|listen|sit|test)(?:s|ing)?\\s+(?:to|with)\\s+(?:our\\s+|real\\s+)?${PEOPLE}`,
        `\\b(?:observ|watch)\\w*\\s+(?:how\\s+)?${PEOPLE}`,
      ].join("|"),
      "i",
    ),
    shows: new RegExp(
      [
        `\\binterview(?:ed|ing|s)?\\s+(?:\\w+\\s+){0,3}${PEOPLE}`,
        `\\b(?:customer|user)\\s+(?:interviews?|research|calls?|visits?|workshops?|discovery|testing)\\b`,
        `\\busability\\s+(?:test|session|stud)\\w*`,
        `\\bshadow(?:ed|ing)\\b`,
        `\\bon[- ]?site\\s+with\\b`,
        `\\b(?:worked|working|sat|met|spoke|talked|paired|collaborated)\\s+(?:directly\\s+|closely\\s+)?with\\s+(?:\\w+\\s+){0,2}${PEOPLE}`,
        `\\b(?:observ|watch)(?:ed|ing)\\s+(?:\\w+\\s+){0,3}(?:${PEOPLE}|someone|people)`,
      ].join("|"),
      "i",
    ),
    gap: "No confirmed statement shows direct contact with customers or users (interviews, observation, support calls).",
    question: (project) =>
      `Did you watch or talk to the people who used ${project}? If so, what did you do with them and what did you learn?`,
    hint: "For example: who you spoke to or observed, how often, and one thing it changed.",
  },
  {
    id: "usage_measurement",
    label: "measuring usage or adoption",
    asks: /\bmeasur\w+\s+(?:how|whether|the\s+impact|impact|adoption|usage|success|results|outcomes)|\badoption\b|\busage\s+(?:data|metrics|analytics)\b|\bproduct\s+(?:analytics|metrics)\b|\binstrument\w*|\ba\/b\s+test\w*|\bexperiment\w*|\bdata[- ](?:driven|informed)\b|\btrack\w*\s+(?:usage|adoption|impact|how)/i,
    shows:
      /\b(?:adoption|usage|analytics|instrument(?:ed|ation|ing)|a\/b[- ]test\w*|experiment(?:s|ed|ation)?|conversion|retention|activation|funnel|engagement)\b|\b(?:tracked|tracking|measured|measuring)\s+(?:\w+\s+){0,2}(?:usage|adoption|engagement|conversion|impact|events|metrics|success|results|how)\b/i,
    gap: "No confirmed statement shows how usage, adoption or feature performance was measured.",
    question: (project) =>
      `How did you know whether ${project} was being used or working well? Name what you tracked and what it showed.`,
    hint: "For example: adoption after launch, a usage metric you tracked, or a number that moved.",
  },
  {
    id: "design_ownership",
    label: "ownership of interface or design decisions",
    asks: /\bdesign\s+(?:engineer\w*|decisions?|sense|craft|judg\w+|thinking|taste|choices?)\b|\b(?:own|lead|drive|shape|make)\w*\s+(?:the\s+)?(?:design|ux|ui|interface|interaction)\b|\b(?:interaction|visual|ux|product)\s+design\b|\bprototyp\w+|\bexplain\w*\s+(?:your|their|the)\s+(?:design|decisions?|reasoning)\b/i,
    shows:
      /\b(?:designed|redesigned|prototyped|sketched|wireframed)\s+(?:[\w-]+\s+){0,4}(?:interface|ui|ux|screen|layout|flow|view|dashboard|table|component|interaction|experience|portal|page|navigation|form)s?\b|\bfigma\b|\bwirefram\w+|\bdesign\s+(?:decisions?|choices?)\b|\binteraction\s+design\b|\binformation\s+architecture\b|\b(?:owned|led)\s+the\s+(?:design|ux|ui|interface)\b/i,
    gap: "No confirmed statement says which interface or design decisions you personally owned.",
    question: (project) => `Which interface or design decisions in ${project} were yours, and why did you make them?`,
    hint: "For example: what the user was trying to decide, the choice you made, and what changed after feedback.",
  },
  {
    id: "feedback_iteration",
    label: "changes made in response to feedback",
    asks: /\b(?:user|customer|client)?\s*feedback\b|\biterat\w+\s+(?:on|with|based|quickly|fast)\b|\bwhat\s+changed\s+after\b/i,
    shows:
      /\bfeedback\b|\b(?:after|following|based\s+on)\s+(?:\w+\s+){0,3}(?:usability|user\s+research|interviews?|observ\w+)\b/i,
    gap: "No confirmed statement shows a change made in response to feedback or observed use.",
    question: (project) => `What did you change in ${project} after seeing someone use it?`,
    hint: "For example: what you noticed, what you changed, and what happened next.",
  },
  {
    id: "ai_features",
    label: "building AI or machine-learning features",
    asks: /\b(?:ai|llms?|genai|generative|machine\s+learning|ml[- ]powered|copilots?|agentic)\b/i,
    shows: /\b(?:ai|llms?|genai|generative|machine\s+learning|ml[- ]powered|copilots?|agentic|gpt|embeddings?|rag)\b/i,
    gap: "No confirmed statement mentions building AI or machine-learning features.",
    question: (project) =>
      `Did ${project} include AI or machine-learning features that you built? If so, what was your part?`,
    hint: "For example: the feature, the model or service behind it, and what you implemented.",
  },
];

/** Signals a criterion calls for, in registry order. */
export function signalsAsked(text: string): EvidenceSignal[] {
  return EVIDENCE_SIGNALS.filter((signal) => signal.asks.test(text));
}

/** Signals a statement or generated claim states outright. */
export function signalsShown(text: string): EvidenceSignal[] {
  return EVIDENCE_SIGNALS.filter((signal) => signal.shows.test(text));
}

export function getSignal(id: string): EvidenceSignal | undefined {
  return EVIDENCE_SIGNALS.find((signal) => signal.id === id);
}

/**
 * Reason to reject `text` when it states a signal its `sourceText` does not,
 * otherwise null. This is what stops design ownership, customer interviews,
 * usage tracking or AI work from being inferred from related experience.
 */
export function unsupportedSignalClaim(text: string, sourceText: string): string | null {
  for (const signal of EVIDENCE_SIGNALS) {
    if (signal.shows.test(text) && !signal.shows.test(sourceText)) {
      return `The cited evidence does not state ${signal.label}; it cannot be inferred from related experience.`;
    }
  }
  return null;
}
