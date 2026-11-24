import { z } from "zod";
import { boards, boardsConfigSchema, collectBoards, type BoardsConfig } from "./boards";
import type { AutomaticSource } from "./types";

/**
 * Greenhouse Job Board API: the public, unauthenticated endpoint companies use
 * to publish their openings (https://developers.greenhouse.io/job-board.html).
 * There is no search across companies, so the owner lists the company boards
 * to follow. One request per board returns its openings with descriptions.
 */
const responseSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.union([z.number(), z.string()]),
      title: z.string().default(""),
      absolute_url: z.string().default(""),
      company_name: z.string().nullish(),
      location: z.object({ name: z.string().nullish() }).nullish(),
      offices: z.array(z.object({ name: z.string().nullish(), location: z.string().nullish() })).nullish(),
      content: z.string().nullish(),
      first_published: z.string().nullish(),
      updated_at: z.string().nullish(),
    }),
  ),
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Company boards confirmed to exist when this adapter was written. A starting point, edited in settings. */
const DEFAULT_BOARDS = boards(
  "adyen",
  ["sumup", "SumUp"],
  ["hellofresh", "HelloFresh"],
  "celonis",
  "contentful",
  "wolt",
  "catawiki",
  "trivago",
  "datadog",
  "elastic",
  ["grafanalabs", "Grafana Labs"],
  ["mongodb", "MongoDB"],
  "stripe",
  "flix",
  "deliveroo",
  "intercom",
  "bitpanda",
  "staffbase",
  "monzo",
  ["gitlab", "GitLab"],
  ["datacamp", "DataCamp"],
  "algolia",
);

export const greenhouseSource: AutomaticSource<BoardsConfig> = {
  id: "greenhouse",
  displayName: "Greenhouse boards",
  mode: "automatic",
  verified: true,
  enabledByDefault: true,
  homepage: "https://www.greenhouse.com",
  description:
    "Career pages of companies that hire through Greenhouse, read from Greenhouse's public Job Board API. You choose which companies to follow.",
  attribution: "Listings link to the company's own posting.",
  allowedHosts: ["boards-api.greenhouse.io"],
  limits: { maxRequestsPerScan: 60, minIntervalMinutes: 0, timeoutMs: 30_000 },
  configSchema: boardsConfigSchema,
  defaultConfig: { boards: DEFAULT_BOARDS },
  unavailableReason: (_query, config) =>
    config.boards.length === 0 ? "No company boards are configured for this source." : null,
  async fetchJobs(_query, config, { http }) {
    return collectBoards(config.boards, async (board) => {
      const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.slug)}/jobs?content=true`;
      const body = responseSchema.parse(await http.getJson(url));
      return body.jobs.map((job) => ({
        externalId: `${board.slug}:${job.id}`,
        url: job.absolute_url,
        title: job.title.trim(),
        company: job.company_name?.trim() || board.name,
        location: job.location?.name ?? "",
        countryHints: (job.offices ?? []).flatMap((office) => [office.location ?? "", office.name ?? ""]),
        descriptionHtml: job.content ?? "",
        postedAt: parseDate(job.first_published) ?? parseDate(job.updated_at),
      }));
    });
  },
};
