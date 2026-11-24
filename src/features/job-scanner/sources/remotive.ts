import { z } from "zod";
import type { AutomaticSource } from "./types";

/**
 * Remotive public API for remote jobs (https://remotive.com/api-documentation).
 * Its terms ask for a link back to Remotive, a mention of Remotive as the
 * source, and no more than a few requests a day; the scanner therefore makes
 * one request per scan and skips the source when it was read recently.
 */
const configSchema = z.object({
  /** Remotive category slug. */
  category: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/)
    .default("software-dev"),
});
type Config = z.infer<typeof configSchema>;

const responseSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.union([z.number(), z.string()]),
      url: z.string().default(""),
      title: z.string().default(""),
      company_name: z.string().default(""),
      candidate_required_location: z.string().nullish(),
      publication_date: z.string().nullish(),
      description: z.string().nullish(),
    }),
  ),
});

export const remotiveSource: AutomaticSource<Config> = {
  id: "remotive",
  displayName: "Remotive",
  mode: "automatic",
  verified: true,
  enabledByDefault: true,
  homepage: "https://remotive.com",
  description:
    "Remote-only job board with a free public API. Used only when Remote is among your work arrangements; a listing is kept when the region it is open to covers one of your countries.",
  attribution: "Source: Remotive. Listings link back to the posting on remotive.com, as its API terms require.",
  allowedHosts: ["remotive.com"],
  // The terms advise at most four requests a day.
  limits: { maxRequestsPerScan: 1, minIntervalMinutes: 360, timeoutMs: 30_000 },
  configSchema,
  defaultConfig: { category: "software-dev" },
  unavailableReason: (query) =>
    query.workArrangements.length > 0 && !query.workArrangements.includes("remote")
      ? "Remote work is not among your work arrangements."
      : null,
  async fetchJobs(_query, config, { http }) {
    const url = `https://remotive.com/api/remote-jobs?category=${encodeURIComponent(config.category)}`;
    const body = responseSchema.parse(await http.getJson(url));
    return {
      jobs: body.jobs.map((job) => {
        const posted = job.publication_date ? new Date(`${job.publication_date}Z`) : null;
        return {
          externalId: String(job.id),
          url: job.url,
          title: job.title.trim(),
          company: job.company_name.trim(),
          location: job.candidate_required_location?.trim() || "Remote",
          workArrangement: "remote" as const,
          descriptionHtml: job.description ?? "",
          postedAt: posted && !Number.isNaN(posted.getTime()) ? posted : null,
        };
      }),
      warnings: [],
    };
  },
};
