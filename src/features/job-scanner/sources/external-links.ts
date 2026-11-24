import type { LinkOnlySource } from "./types";

/**
 * Sources without a permitted way to read listings automatically. The scanner
 * does not fetch anything from them: it only builds a link that opens the
 * site's own search in the owner's browser, and the owner can import a posting
 * they found there by pasting it (see `importJobPosting`).
 */

const EURES_COUNTRIES = new Set(
  "AT BE BG CH CY CZ DE DK EE ES FI FR GR HR HU IE IS IT LI LT LU LV MT NL NO PL PT RO SE SI SK".split(" "),
);

/** Countries with their own Indeed site; others use the international site with a location. */
const INDEED_HOSTS: Record<string, string> = {
  DE: "de.indeed.com",
  NL: "nl.indeed.com",
  AT: "at.indeed.com",
  SE: "se.indeed.com",
  DK: "dk.indeed.com",
  GB: "uk.indeed.com",
  IE: "ie.indeed.com",
  PL: "pl.indeed.com",
  CZ: "cz.indeed.com",
  BE: "be.indeed.com",
  NO: "no.indeed.com",
  LU: "lu.indeed.com",
  CH: "ch.indeed.com",
  CA: "ca.indeed.com",
  NZ: "nz.indeed.com",
  AE: "ae.indeed.com",
  SG: "sg.indeed.com",
  QA: "qa.indeed.com",
  FR: "fr.indeed.com",
  ES: "es.indeed.com",
  IT: "it.indeed.com",
  PT: "pt.indeed.com",
  FI: "fi.indeed.com",
  AU: "au.indeed.com",
  US: "www.indeed.com",
};

export const linkedinSource: LinkOnlySource = {
  id: "linkedin",
  displayName: "LinkedIn Jobs",
  mode: "link_only",
  homepage: "https://www.linkedin.com/jobs",
  description: "Opens a LinkedIn job search for one of your titles and countries in your browser.",
  limitation:
    "LinkedIn has no API for discovering jobs: its job APIs are for approved partners to post jobs, and its terms prohibit automated collection of listings. Cverixa therefore does not read LinkedIn. Use the search link, then import a posting you want to track by pasting its link and text.",
  searchUrl(keyword, country) {
    const url = new URL("https://www.linkedin.com/jobs/search/");
    url.searchParams.set("keywords", keyword);
    if (country) url.searchParams.set("location", country.name);
    return url.toString();
  },
};

export const indeedSource: LinkOnlySource = {
  id: "indeed",
  displayName: "Indeed",
  mode: "link_only",
  homepage: "https://www.indeed.com",
  description: "Opens an Indeed search for one of your titles on the country's Indeed site.",
  limitation:
    "Indeed no longer offers a public job search API and does not permit automated collection of its listings.",
  searchUrl(keyword, country) {
    const host = country ? INDEED_HOSTS[country.code] : "www.indeed.com";
    const url = new URL(`https://${host ?? "www.indeed.com"}/jobs`);
    url.searchParams.set("q", keyword);
    if (country && !host) url.searchParams.set("l", country.name);
    return url.toString();
  },
};

export const euresSource: LinkOnlySource = {
  id: "eures",
  displayName: "EURES",
  mode: "link_only",
  homepage: "https://europa.eu/eures/portal",
  description: "Opens a search on the European Job Mobility Portal (EU, EEA and Switzerland).",
  limitation:
    "EURES has no public API for third-party applications; its vacancy data is exchanged between member employment services.",
  searchUrl(keyword, country) {
    if (country && !EURES_COUNTRIES.has(country.code)) return null;
    const url = new URL("https://europa.eu/eures/portal/jv-se/search");
    url.searchParams.set("page", "1");
    url.searchParams.set("resultsPerPage", "10");
    url.searchParams.set("orderBy", "BEST_MATCH");
    url.searchParams.set("keywordsEverywhere", keyword);
    if (country) url.searchParams.set("locationCodes", country.code.toLowerCase());
    url.searchParams.set("lang", "en");
    return url.toString();
  },
};

export const welcomeToTheJungleSource: LinkOnlySource = {
  id: "wttj",
  displayName: "Welcome to the Jungle",
  mode: "link_only",
  homepage: "https://www.welcometothejungle.com",
  description: "Opens a Welcome to the Jungle search for one of your titles and countries.",
  limitation: "Welcome to the Jungle does not publish an API for reading its listings.",
  searchUrl(keyword, country) {
    const url = new URL("https://www.welcometothejungle.com/en/jobs");
    url.searchParams.set("query", keyword);
    if (country) url.searchParams.append("refinementList[offices.country_code][]", country.code);
    return url.toString();
  },
};

/** Host names that identify the site a manually imported posting came from. */
export const IMPORT_HOSTS: Array<{ pattern: RegExp; sourceId: string; label: string }> = [
  { pattern: /(^|\.)linkedin\.com$/i, sourceId: "linkedin", label: "LinkedIn Jobs" },
  { pattern: /(^|\.)indeed\.com$/i, sourceId: "indeed", label: "Indeed" },
  { pattern: /(^|\.)glassdoor\.[a-z.]+$/i, sourceId: "glassdoor", label: "Glassdoor" },
  { pattern: /(^|\.)wellfound\.com$/i, sourceId: "wellfound", label: "Wellfound" },
  { pattern: /(^|\.)welcometothejungle\.com$/i, sourceId: "wttj", label: "Welcome to the Jungle" },
  { pattern: /(^|\.)europa\.eu$/i, sourceId: "eures", label: "EURES" },
];
