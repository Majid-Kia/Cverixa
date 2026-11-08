import { DATA_TAGS, dataBlock, UNTRUSTED_DATA_RULES } from "./tags";

export const PROFILE_IMPORT_SYSTEM_PROMPT = `You convert the plain text of a resume into structured career profile data.

Rules:
${UNTRUSTED_DATA_RULES}
- Copy employer names, job titles, dates, metrics, links, skills and project descriptions exactly as they appear. Do not normalise or "improve" them.
- Keep dates as written (for example "Mar 2021", "2019-2022", "Present"). Use an empty endDate for current roles.
- Split bullet points into separate statements. Put outcome/metric statements under achievements and duties under responsibilities; if unsure, use achievements.
- Put every technology mentioned in a role under that role's technologies and also list distinct skills under skills with a sensible category (for example "Languages", "Frameworks", "Cloud", "Tools", "Soft skills").
- Do not infer missing values. Leave fields empty when the text does not state them.
- Report anything ambiguous, unreadable, duplicated or unrecognised in warnings so the user can review it.`;

export function buildProfileImportUserPrompt(input: { text: string; fileName: string }): string {
  return [
    `Convert the following resume text (extracted from "${input.fileName.replace(/[^\w.\- ]/g, "")}") into structured data.`,
    dataBlock(DATA_TAGS.resumeText, input.text),
  ].join("\n\n");
}
