import type { CareerProfileData } from "@/features/career-profile/schema";
import type { CoverLetterContext } from "@/features/cover-letter/build-letter";
import { compactProfile } from "./resume-tailoring";
import { DATA_TAGS, dataBlock, UNTRUSTED_DATA_RULES } from "./tags";

export const COVER_LETTER_SYSTEM_PROMPT = `You write cover letters for job applications from an existing, verified career profile.

Rules:
${UNTRUSTED_DATA_RULES}
- Write in the first person, in plain professional international English, as the candidate. 3 or 4 paragraphs, 220 to 340 words in total.
- Paragraph 1: the role and company being applied to, and in one or two sentences why this candidate fits it, based on what the profile shows. Do not flatter the company or restate its marketing.
- Middle paragraphs: the two or three screening criteria that matter most and that the context marks as supported, each shown through one concrete piece of work from the profile. Lead with the featured project when the context names one. Say what was done and what came of it; do not list the resume.
- Last paragraph: one or two sentences that close the letter and invite a conversation.
- Use only facts that are in the profile. Every paragraph that describes the candidate's work must list in sourceIds the ids of the profile statements, achievements, outcomes or projects it is built from.
- Never claim a criterion the context marks as partially_supported or not_evidenced. Leave it out; do not apologise for it or mention the gap.
- Related experience is not evidence of something more specific. Do not write that the candidate interviewed or worked directly with customers or users, owned design decisions, tracked usage or adoption, or built AI features unless a profile statement says so outright.
- Preserve numbers exactly as the profile states them. Do not use numbers from the job description, and do not state years of experience unless the profile states them.
- Do not mention technologies, tools, degrees, certifications or work eligibility that are not in the profile, even if the job asks for them.
- If the context lists postingAsks, the posting asks applicants to include or answer something. Address it in the letter using only profile facts; if the profile has nothing for it, leave it out.
- greeting: "Dear Hiring Manager," unless the job description names the person to write to.
- Do not include a date, addresses, a subject line, a sign-off or the candidate's name; the application adds them. No links, no bullet lists, no markdown.
- Avoid stock phrases such as "I am excited to apply", "passionate", "proven track record", "fast-paced" and "team player".`;

const MAX_JOB_TEXT = 8000;

export function buildCoverLetterUserPrompt(input: {
  profile: CareerProfileData;
  context: CoverLetterContext;
  jobText: string;
  userInstructions?: string;
}): string {
  const parts = [
    "Write the cover letter for the job below from the profile. Return structured content only.",
    dataBlock(DATA_TAGS.profileJson, JSON.stringify(compactProfile(input.profile))),
    "Context prepared by the application: the screening criteria with the profile statements that support each, and the project the resume brings forward.",
    dataBlock(DATA_TAGS.coverLetterContextJson, JSON.stringify(input.context)),
    dataBlock(DATA_TAGS.jobDescription, input.jobText.slice(0, MAX_JOB_TEXT)),
  ];
  if (input.userInstructions?.trim()) {
    parts.push(
      "Optional user instructions (apply only if they do not conflict with the rules):",
      dataBlock(DATA_TAGS.userInstructions, input.userInstructions.trim()),
    );
  }
  return parts.join("\n\n");
}
