import type { ZodType } from "zod";
import type { ListingArrangement, WorkArrangement } from "../constants";
import type { SourceHttp } from "./http";

/** What the owner is searching for, as given to every source. */
export interface SourceQuery {
  /** Job titles and keywords. Sources without server-side search return everything; filtering happens afterwards. */
  keywords: string[];
  /** ISO country codes; empty means any country. */
  countries: string[];
  workArrangements: WorkArrangement[];
}

/**
 * A posting as a source returned it, reduced to the fields the scanner uses.
 * Contains only what the source published; nothing about the candidate is
 * ever sent to a source.
 */
export interface SourceJob {
  /** Identifier assigned by the source, stable across scans. */
  externalId: string;
  /** Public URL of the posting. */
  url: string;
  applyUrl?: string | null;
  title: string;
  company: string;
  /** Location text as published. */
  location: string;
  /** Structured country names or ISO codes, when the source provides them. */
  countryHints?: string[];
  workArrangement?: ListingArrangement;
  /** Description as HTML or as plain text; one of the two. */
  descriptionHtml?: string;
  descriptionText?: string;
  postedAt?: Date | null;
  /** True when the source itself lists the posting under visa sponsorship. */
  sponsorshipFlag?: boolean;
}

export interface SourceFetchResult {
  jobs: SourceJob[];
  /** Problems that did not stop the source (for example one company board that failed). */
  warnings: string[];
}

export interface SourceContext {
  http: SourceHttp;
}

/** How the scanner gets jobs from a source. */
export type SourceMode =
  /** Listings are fetched by the scanner from an API the source publishes for this purpose. */
  | "automatic"
  /** No permitted automated access exists; the scanner only links to the source's own search. */
  | "link_only";

interface SourceBase {
  id: string;
  displayName: string;
  mode: SourceMode;
  homepage: string;
  /** One sentence shown in settings: what the source is and how it is accessed. */
  description: string;
}

export interface AutomaticSource<Config = unknown> extends SourceBase {
  mode: "automatic";
  /** Whether the endpoint was confirmed to respond when this adapter was written. */
  verified: boolean;
  enabledByDefault: boolean;
  /** How results from this source must be credited, per its terms. */
  attribution: string;
  /** Hosts the adapter may contact. Requests to any other host are refused. */
  allowedHosts: string[];
  limits: {
    /** Requests allowed in one scan. */
    maxRequestsPerScan: number;
    /** Minimum minutes between two scans of this source (the source's own guidance). */
    minIntervalMinutes: number;
    timeoutMs: number;
  };
  configSchema: ZodType<Config>;
  defaultConfig: Config;
  /** Why the source cannot run with this query and configuration, or null when it can. */
  unavailableReason(query: SourceQuery, config: Config): string | null;
  fetchJobs(query: SourceQuery, config: Config, context: SourceContext): Promise<SourceFetchResult>;
}

export interface LinkOnlySource extends SourceBase {
  mode: "link_only";
  /** Why listings from this source are not ingested automatically. */
  limitation: string;
  /**
   * Whether the site's search matches quoted phrases joined with OR against the posting text, so a
   * search can be narrowed to postings that mention sponsorship or relocation.
   */
  sponsorshipSearch: boolean;
  /**
   * A search on the source's own site for one keyword and country; null when the country is not
   * covered. With `sponsorship`, sites that support it also require a sponsorship or relocation phrase.
   */
  searchUrl(
    keyword: string,
    country: { code: string; name: string } | null,
    options?: { sponsorship?: boolean },
  ): string | null;
}

export type JobSource = AutomaticSource | LinkOnlySource;

/** Company boards are configured as lines of "slug" or "slug | Company name". */
export interface BoardRef {
  slug: string;
  name: string;
}
