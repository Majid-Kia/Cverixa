import { z } from "zod";
import type { AutomaticSource, SourceJob } from "./types";

/**
 * Arbeitnow publishes a free job-board API for jobs in Germany and other
 * European countries (https://www.arbeitnow.com/blog/job-board-api). It needs
 * no key and has a `visa_sponsorship` filter. The API has no keyword search,
 * so the newest pages are fetched and filtered by the scanner.
 */
const configSchema = z.object({
  /** Fetch only postings the board lists under visa sponsorship. */
  visaSponsorshipOnly: z.boolean().default(true),
  /** Pages of about 300 postings each, newest first. */
  maxPages: z.coerce.number().int().min(1).max(5).default(2),
});
type Config = z.infer<typeof configSchema>;

const responseSchema = z.object({
  data: z.array(
    z.object({
      slug: z.string().min(1),
      company_name: z.string().default(""),
      title: z.string().default(""),
      description: z.string().default(""),
      remote: z.boolean().nullish(),
      url: z.string().default(""),
      location: z.string().nullish(),
      created_at: z.number().nullish(),
    }),
  ),
  links: z.object({ next: z.string().nullish() }).partial().nullish(),
});

export const arbeitnowSource: AutomaticSource<Config> = {
  id: "arbeitnow",
  displayName: "Arbeitnow",
  mode: "automatic",
  verified: true,
  enabledByDefault: true,
  homepage: "https://www.arbeitnow.com",
  description:
    "European job board with a free public API and a visa-sponsorship filter. Strongest for Germany; also lists other European countries.",
  attribution: "Listings link back to Arbeitnow, as its API terms ask.",
  allowedHosts: ["www.arbeitnow.com"],
  limits: { maxRequestsPerScan: 6, minIntervalMinutes: 30, timeoutMs: 30_000 },
  configSchema,
  defaultConfig: { visaSponsorshipOnly: true, maxPages: 2 },
  unavailableReason: () => null,
  async fetchJobs(_query, config, { http }) {
    const jobs: SourceJob[] = [];
    for (let page = 1; page <= config.maxPages; page += 1) {
      const url = new URL("https://www.arbeitnow.com/api/job-board-api");
      if (config.visaSponsorshipOnly) url.searchParams.set("visa_sponsorship", "true");
      url.searchParams.set("page", String(page));
      const body = responseSchema.parse(await http.getJson(url.toString()));
      for (const item of body.data) {
        jobs.push({
          externalId: item.slug,
          url: item.url,
          title: item.title,
          company: item.company_name,
          location: item.location ?? "",
          workArrangement: item.remote ? "remote" : "unknown",
          descriptionHtml: item.description,
          postedAt: item.created_at ? new Date(item.created_at * 1000) : null,
          // Known only when the board's own filter was applied to the request.
          sponsorshipFlag: config.visaSponsorshipOnly,
        });
      }
      if (body.data.length === 0 || !body.links?.next) break;
    }
    return { jobs, warnings: [] };
  },
};
