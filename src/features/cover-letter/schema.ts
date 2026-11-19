import { z } from "zod";

/**
 * What the model returns for a cover letter: a greeting and the paragraphs.
 * The application adds the sign-off and the owner's name itself. Each
 * paragraph cites the confirmed profile statements it is built from.
 */
export const coverLetterAiOutputSchema = z.object({
  greeting: z.string().default(""),
  paragraphs: z
    .array(
      z.object({
        text: z.string().default(""),
        sourceIds: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});
export type CoverLetterAiOutput = z.infer<typeof coverLetterAiOutputSchema>;

/** What the fact check did to the generated letter, shown next to it. */
export const coverLetterReportSchema = z.object({
  /** Sentences removed because the confirmed profile does not support them. */
  removed: z.array(z.object({ text: z.string(), reason: z.string() })).default([]),
  /** Screening criteria the profile does not fully support; the letter does not claim them. */
  notClaimed: z.array(z.string()).default([]),
  /** What the posting asks applicants to send or answer, quoted, for the owner to check the letter against. */
  postingAsks: z.array(z.string()).default([]),
});
export type CoverLetterReport = z.infer<typeof coverLetterReportSchema>;

export const COVER_LETTER_MAX_LENGTH = 8000;

export const coverLetterBodySchema = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n").trim())
  .pipe(z.string().min(1, "The letter is empty.").max(COVER_LETTER_MAX_LENGTH, "The letter is too long."));
