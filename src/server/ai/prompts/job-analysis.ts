import { DATA_TAGS, dataBlock, UNTRUSTED_DATA_RULES } from "./tags";

export const JOB_ANALYSIS_SYSTEM_PROMPT = `You are an expert technical recruiter analysing a job posting.
Extract the job requirements as structured data.

Rules:
${UNTRUSTED_DATA_RULES}
- Only extract requirements that are actually stated in the job description.
- Classify a requirement as "mandatory" only when the posting explicitly requires it (for example "required", "must have", "minimum"). Frequency of a keyword does not make it mandatory; default to "preferred".
- Use categories: technical_skill, preferred_skill, responsibility, domain_knowledge, qualification, terminology, soft_skill, leadership, restriction.
- Put explicit constraints such as work authorisation, location, clearance, or mandatory degrees under "restriction" or "qualification".
- Quote the supporting text verbatim (short excerpt) for every requirement.
- List concrete technology or skill names in relatedSkills using the posting's own terminology.
- Keep descriptions concise (one sentence).
- Mark as priority "high" the few requirements a recruiter would screen on first: what the role is hired to do, the kind of product or users, and the must-have skills.
- applicationRequirements: anything the posting explicitly asks the applicant to submit or do when applying (kind project_note for a note about a project or piece of work, portfolio, cover_letter, application_question, other). Quote the sentence verbatim in supportingText. Leave empty when the posting asks for nothing beyond a resume.
- logistics: explicitly stated office-attendance, location or relocation requirements (kind office or relocation), quoted verbatim in supportingText.
- Do not add sponsorship, visa or work-eligibility rules that the posting does not state. If the posting is silent on them, extract nothing about them.`;

export function buildJobAnalysisUserPrompt(input: { text: string; title?: string; company?: string }): string {
  const context = [
    input.title ? `Stated job title: ${input.title}` : null,
    input.company ? `Company: ${input.company}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    "Analyse the following job description and return the structured requirements.",
    context,
    dataBlock(DATA_TAGS.jobDescription, input.text),
  ]
    .filter(Boolean)
    .join("\n\n");
}
