import { newId } from "@/lib/ids";
import { isVerbatim } from "./application-context";
import { jobAnalysisSchema, type JobAnalysis, type JobAnalysisAiOutput } from "./schema";

/**
 * Cut model text to a field's limit, at a word boundary where possible. Models
 * do not respect length limits reliably (a "seniority" can come back as a
 * whole sentence), and an over-long field must not fail the whole analysis.
 */
export function clip(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, "");
}

/**
 * Turn the model's job analysis into the stored shape: every field is cut to
 * its limit, unusable entries are dropped rather than failing the analysis,
 * ids are assigned, and application/logistics items are kept only when they
 * quote the posting word for word. Returns null only if the result still does
 * not validate.
 */
export function toJobAnalysis(
  output: JobAnalysisAiOutput,
  job: { originalText: string; title: string },
): JobAnalysis | null {
  const parsed = jobAnalysisSchema.safeParse({
    jobTitle: clip(output.jobTitle || job.title, 200),
    seniority: clip(output.seniority, 100),
    summary: clip(output.summary, 2000),
    requirements: output.requirements
      .map((requirement) => ({
        ...requirement,
        id: newId("req"),
        description: clip(requirement.description, 500),
        supportingText: clip(requirement.supportingText, 1000),
        relatedSkills: requirement.relatedSkills
          .map((skill) => clip(skill, 100))
          .filter(Boolean)
          .slice(0, 20),
      }))
      .filter((requirement) => requirement.description.length > 0),
    applicationRequirements: output.applicationRequirements
      .filter((item) => isVerbatim(job.originalText, item.supportingText))
      .slice(0, 10)
      .map((item) => ({
        ...item,
        id: newId("apply"),
        description: clip(item.description, 500),
        supportingText: clip(item.supportingText, 1000),
      }))
      .filter((item) => item.description.length > 0),
    logistics: output.logistics
      .filter((item) => isVerbatim(job.originalText, item.supportingText))
      .slice(0, 10)
      .map((item) => ({
        ...item,
        id: newId("logistics"),
        description: clip(item.description, 500),
        supportingText: clip(item.supportingText, 1000),
      }))
      .filter((item) => item.description.length > 0),
  });
  return parsed.success ? parsed.data : null;
}
