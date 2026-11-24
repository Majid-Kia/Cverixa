import { z } from "zod";
import type { ListingArrangement } from "../constants";
import { boards, boardsConfigSchema, collectBoards, type BoardsConfig } from "./boards";
import type { AutomaticSource } from "./types";

/**
 * Ashby public job posting API: an unauthenticated endpoint per company board
 * (https://developers.ashbyhq.com/docs/public-job-posting-api). Like
 * Greenhouse, it has no search across companies; the owner lists the boards.
 */
const address = z
  .object({ postalAddress: z.object({ addressCountry: z.string().nullish() }).partial().nullish() })
  .partial()
  .nullish();

const responseSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().default(""),
      location: z.string().nullish(),
      secondaryLocations: z.array(z.object({ location: z.string().nullish(), address }).partial()).nullish(),
      isListed: z.boolean().nullish(),
      isRemote: z.boolean().nullish(),
      workplaceType: z.string().nullish(),
      address,
      jobUrl: z.string().default(""),
      applyUrl: z.string().nullish(),
      descriptionPlain: z.string().nullish(),
      descriptionHtml: z.string().nullish(),
      publishedAt: z.string().nullish(),
    }),
  ),
});

function arrangement(
  workplaceType: string | null | undefined,
  isRemote: boolean | null | undefined,
): ListingArrangement {
  const value = (workplaceType ?? "").toLowerCase();
  if (value === "remote") return "remote";
  if (value === "hybrid") return "hybrid";
  if (value === "onsite" || value === "on-site") return "onsite";
  return isRemote ? "remote" : "unknown";
}

/** Company boards confirmed to exist when this adapter was written. A starting point, edited in settings. */
const DEFAULT_BOARDS = boards(
  "lovable",
  "n8n",
  "legora",
  "parloa",
  "qonto",
  "attio",
  ["elevenlabs", "ElevenLabs"],
  "wayve",
  "synthesia",
  ["deepl", "DeepL"],
  "alan",
  "mollie",
  "pleo",
  "linear",
  "supabase",
  "cohere",
);

export const ashbySource: AutomaticSource<BoardsConfig> = {
  id: "ashby",
  displayName: "Ashby boards",
  mode: "automatic",
  verified: true,
  enabledByDefault: true,
  homepage: "https://www.ashbyhq.com",
  description:
    "Career pages of companies that hire through Ashby, read from Ashby's public job posting API. You choose which companies to follow.",
  attribution: "Listings link to the company's own posting.",
  allowedHosts: ["api.ashbyhq.com"],
  limits: { maxRequestsPerScan: 60, minIntervalMinutes: 0, timeoutMs: 30_000 },
  configSchema: boardsConfigSchema,
  defaultConfig: { boards: DEFAULT_BOARDS },
  unavailableReason: (_query, config) =>
    config.boards.length === 0 ? "No company boards are configured for this source." : null,
  async fetchJobs(_query, config, { http }) {
    return collectBoards(config.boards, async (board) => {
      const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.slug)}`;
      const body = responseSchema.parse(await http.getJson(url));
      return body.jobs
        .filter((job) => job.isListed !== false)
        .map((job) => {
          const secondary = job.secondaryLocations ?? [];
          return {
            externalId: `${board.slug}:${job.id}`,
            url: job.jobUrl,
            applyUrl: job.applyUrl ?? null,
            title: job.title.trim(),
            company: board.name,
            location: [job.location ?? "", ...secondary.map((item) => item.location ?? "")].filter(Boolean).join("; "),
            countryHints: [
              job.address?.postalAddress?.addressCountry ?? "",
              ...secondary.map((item) => item.address?.postalAddress?.addressCountry ?? ""),
            ].filter(Boolean),
            workArrangement: arrangement(job.workplaceType, job.isRemote),
            descriptionText: job.descriptionPlain ?? undefined,
            descriptionHtml: job.descriptionPlain ? undefined : (job.descriptionHtml ?? ""),
            postedAt: job.publishedAt ? new Date(job.publishedAt) : null,
          };
        });
    });
  },
};
