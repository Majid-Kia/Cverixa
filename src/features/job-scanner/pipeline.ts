import type { ListingArrangement, WorkArrangement } from "./constants";
import { matchCountries, resolveLocation } from "./countries";
import { classifyVisaSupport, type VisaSupport } from "./sponsorship";
import { buildDedupeKey, canonicalUrl, cleanText, descriptionHash, htmlToText, matchKeywords } from "./text";
import type { SourceJob } from "./sources/types";

/** The preferences that decide whether a posting is kept. */
export interface ListingFilters {
  keywords: string[];
  countries: string[];
  workArrangements: WorkArrangement[];
  requireSponsorship: boolean;
  excludeWorkAuthRequired: boolean;
  excludeNoSponsorship: boolean;
}

/** A posting that passed every filter, normalised and classified, ready to be saved. */
export interface Candidate {
  sourceId: string;
  externalId: string;
  url: string;
  applyUrl: string | null;
  title: string;
  company: string;
  location: string;
  countryCode: string | null;
  city: string | null;
  workArrangement: ListingArrangement;
  description: string;
  descriptionHash: string;
  postedAt: Date | null;
  dedupeKey: string;
  visa: VisaSupport;
  matchedKeywords: string[];
}

export type SkipReason =
  | "invalid"
  | "title"
  | "other_country"
  | "unresolved_location"
  | "work_arrangement"
  | "no_sponsorship"
  | "work_authorization_required"
  | "sponsorship_not_stated";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  invalid: "Missing title, company or a valid link",
  title: "Title did not match your job titles",
  other_country: "Located in a country you did not select",
  unresolved_location: "Location could not be mapped to a country",
  work_arrangement: "Work arrangement not among your preferences",
  no_sponsorship: "Posting excludes visa sponsorship",
  work_authorization_required: "Posting requires existing work authorisation",
  sponsorship_not_stated: "Sponsorship not stated (you require it)",
};

export type Processed = { kind: "keep"; candidate: Candidate } | { kind: "skip"; reason: SkipReason };

/** Work arrangement stated by the source, the location text or, failing that, the posting. */
export function inferArrangement(
  hint: ListingArrangement | undefined,
  location: string,
  title: string,
  description: string,
): ListingArrangement {
  if (hint && hint !== "unknown") return hint;
  const headline = `${location} ${title}`.toLowerCase();
  if (/\bhybrid\b/.test(headline)) return "hybrid";
  if (/\b(remote|home[- ]based|work from home|distributed)\b/.test(headline)) return "remote";
  if (/\b(on[- ]?site|in[- ]office)\b/.test(headline)) return "onsite";
  const text = description.toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\b(fully remote|100% remote|remote[- ]first|work from anywhere)\b/.test(text)) return "remote";
  if (/\b(on[- ]site|office[- ]based|in the office (five|5) days)\b/.test(text)) return "onsite";
  return "unknown";
}

/**
 * Turn one posting from a source into a candidate listing, or say why it is
 * left out. Order matters for cost: cheap checks (title, country) run before
 * the description is converted and classified.
 */
export function processSourceJob(
  job: SourceJob,
  source: { id: string; label: string },
  filters: ListingFilters,
): Processed {
  const url = canonicalUrl(job.url);
  const title = job.title.replace(/\s+/g, " ").trim().slice(0, 200);
  const company = job.company.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!url || !title || !company || !job.externalId) return { kind: "skip", reason: "invalid" };

  const matchedKeywords = matchKeywords(title, filters.keywords);
  if (matchedKeywords.length === 0) return { kind: "skip", reason: "title" };

  const location = job.location.replace(/\s+/g, " ").trim().slice(0, 200);
  const resolution = resolveLocation(location, job.countryHints ?? []);
  const description = job.descriptionText ? cleanText(job.descriptionText) : htmlToText(job.descriptionHtml ?? "");
  const workArrangement = inferArrangement(job.workArrangement, location, title, description);
  const country = matchCountries(resolution, filters.countries, {
    remote: workArrangement === "remote" || resolution.remote,
  });
  if (!country.matches) {
    return { kind: "skip", reason: country.reason === "unresolved" ? "unresolved_location" : "other_country" };
  }
  if (
    filters.workArrangements.length > 0 &&
    workArrangement !== "unknown" &&
    !filters.workArrangements.includes(workArrangement)
  ) {
    return { kind: "skip", reason: "work_arrangement" };
  }

  const visa = classifyVisaSupport(description, {
    sourceUrl: url,
    sourceFlag: job.sponsorshipFlag ? { label: source.label } : null,
  });
  if (filters.excludeNoSponsorship && visa.sponsorship.status === "none") {
    return { kind: "skip", reason: "no_sponsorship" };
  }
  if (filters.excludeWorkAuthRequired && visa.workAuthorization.required && visa.sponsorship.status !== "confirmed") {
    return { kind: "skip", reason: "work_authorization_required" };
  }
  if (filters.requireSponsorship && visa.sponsorship.status !== "confirmed" && visa.sponsorship.status !== "possible") {
    return { kind: "skip", reason: "sponsorship_not_stated" };
  }

  return {
    kind: "keep",
    candidate: {
      sourceId: source.id,
      externalId: job.externalId.slice(0, 200),
      url,
      applyUrl: canonicalUrl(job.applyUrl),
      title,
      company,
      location: location || "Not stated",
      countryCode: country.countryCode,
      city: resolution.city,
      workArrangement,
      description,
      descriptionHash: descriptionHash(description),
      postedAt: job.postedAt && !Number.isNaN(job.postedAt.getTime()) ? job.postedAt : null,
      dedupeKey: buildDedupeKey({ company, title, countryCode: country.countryCode, city: resolution.city }),
      visa,
      matchedKeywords,
    },
  };
}

/**
 * Remove copies of the same job within one scan before anything is saved or
 * analysed: the same source id, the same URL or the same company, title and
 * place. The first copy wins; sources are processed in registry order.
 */
export function dedupeCandidates(candidates: Candidate[]): { unique: Candidate[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: Candidate[] = [];
  let duplicates = 0;
  for (const candidate of candidates) {
    const keys = [
      `id:${candidate.sourceId}:${candidate.externalId}`,
      `url:${candidate.url}`,
      `key:${candidate.dedupeKey}`,
    ];
    if (keys.some((key) => seen.has(key))) {
      duplicates += 1;
      continue;
    }
    for (const key of keys) seen.add(key);
    unique.push(candidate);
  }
  return { unique, duplicates };
}
