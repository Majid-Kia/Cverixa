import { z } from "zod";
import type { ListingArrangement } from "../constants";
import { boardsConfigSchema, collectBoards, type BoardsConfig } from "./boards";
import type { AutomaticSource } from "./types";

/**
 * Lever Postings API (https://github.com/lever/postings-api): published
 * postings of a company are publicly readable as JSON without a key.
 *
 * This adapter follows the documented response shape and is covered by tests
 * with recorded-shape fixtures, but the endpoint could not be reached from the
 * machine it was written on, so it is marked unverified and is off until the
 * owner adds company boards and enables it. Companies hosted in Lever's EU
 * region are given as "eu.company".
 */
const responseSchema = z.array(
  z.object({
    id: z.string().min(1),
    text: z.string().default(""),
    hostedUrl: z.string().default(""),
    applyUrl: z.string().nullish(),
    createdAt: z.number().nullish(),
    country: z.string().nullish(),
    workplaceType: z.string().nullish(),
    categories: z
      .object({ location: z.string().nullish(), allLocations: z.array(z.string()).nullish() })
      .partial()
      .nullish(),
    descriptionPlain: z.string().nullish(),
    description: z.string().nullish(),
    lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
    additionalPlain: z.string().nullish(),
  }),
);

function arrangement(value: string | null | undefined): ListingArrangement {
  const type = (value ?? "").toLowerCase();
  if (type === "remote") return "remote";
  if (type === "hybrid") return "hybrid";
  if (type === "on-site" || type === "onsite") return "onsite";
  return "unknown";
}

export const leverSource: AutomaticSource<BoardsConfig> = {
  id: "lever",
  displayName: "Lever boards",
  mode: "automatic",
  verified: false,
  enabledByDefault: false,
  homepage: "https://www.lever.co",
  description:
    "Career pages of companies that hire through Lever, read from Lever's public Postings API. Built from the published documentation; not yet confirmed against the live service.",
  attribution: "Listings link to the company's own posting.",
  allowedHosts: ["api.lever.co", "api.eu.lever.co"],
  limits: { maxRequestsPerScan: 60, minIntervalMinutes: 0, timeoutMs: 30_000 },
  configSchema: boardsConfigSchema,
  defaultConfig: { boards: [] },
  unavailableReason: (_query, config) =>
    config.boards.length === 0 ? "No company boards are configured for this source." : null,
  async fetchJobs(_query, config, { http }) {
    return collectBoards(config.boards, async (board) => {
      const eu = board.slug.toLowerCase().startsWith("eu.");
      const site = eu ? board.slug.slice(3) : board.slug;
      const host = eu ? "api.eu.lever.co" : "api.lever.co";
      const body = responseSchema.parse(
        await http.getJson(`https://${host}/v0/postings/${encodeURIComponent(site)}?mode=json`),
      );
      return body.map((posting) => {
        const lists = (posting.lists ?? [])
          .map((list) => `<h3>${list.text ?? ""}</h3><ul>${list.content ?? ""}</ul>`)
          .join("\n");
        const plain = [posting.descriptionPlain, posting.additionalPlain].filter(Boolean).join("\n\n");
        return {
          externalId: `${board.slug}:${posting.id}`,
          url: posting.hostedUrl,
          applyUrl: posting.applyUrl ?? null,
          title: posting.text.trim(),
          company: board.name,
          location: (posting.categories?.allLocations?.length
            ? posting.categories.allLocations
            : [posting.categories?.location ?? ""]
          )
            .filter(Boolean)
            .join("; "),
          countryHints: posting.country ? [posting.country] : [],
          workArrangement: arrangement(posting.workplaceType),
          descriptionHtml: `${plain ? `<p>${escapeHtml(plain).replace(/\n/g, "<br>")}</p>` : (posting.description ?? "")}\n${lists}`,
          postedAt: posting.createdAt ? new Date(posting.createdAt) : null,
        };
      });
    });
  },
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
