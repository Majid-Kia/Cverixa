import { describe, expect, it } from "vitest";
import { SUGGESTED_COUNTRY_CODES } from "@/features/job-scanner/constants";
import {
  COUNTRIES,
  countryName,
  isCountryCode,
  matchCountries,
  resolveLocation,
} from "@/features/job-scanner/countries";
import { processSourceJob, type ListingFilters } from "@/features/job-scanner/pipeline";
import type { SourceJob } from "@/features/job-scanner/sources/types";

const countriesOf = (location: string, hints: string[] = []) => resolveLocation(location, hints).countries;

describe("country list", () => {
  it("offers every suggested country and many more", () => {
    expect(COUNTRIES.length).toBeGreaterThan(150);
    for (const code of SUGGESTED_COUNTRY_CODES) expect(isCountryCode(code)).toBe(true);
    expect(countryName("CZ")).toBe("Czech Republic");
    expect(countryName("AE")).toBe("United Arab Emirates");
    expect(countryName("NL")).toBe("Netherlands");
  });
});

describe("location resolution", () => {
  it("reads country names, aliases and trailing codes", () => {
    expect(countriesOf("Berlin, Germany")).toEqual(["DE"]);
    expect(countriesOf("London, UK")).toEqual(["GB"]);
    expect(countriesOf("London, England, United Kingdom")).toEqual(["GB"]);
    expect(countriesOf("UK - Manchester")).toEqual(["GB"]);
    expect(countriesOf("Amsterdam, NL")).toEqual(["NL"]);
    expect(countriesOf("Remote, Canada")).toEqual(["CA"]);
    expect(countriesOf("Germany (Remote)")).toEqual(["DE"]);
    expect(countriesOf("Republic of Ireland (Remote)")).toEqual(["IE"]);
    expect(countriesOf("Dubai, UAE")).toEqual(["AE"]);
  });

  it("resolves well-known cities without a country", () => {
    expect(countriesOf("Berlin (Hybrid)")).toEqual(["DE"]);
    expect(countriesOf("Hub - Berlin")).toEqual(["DE"]);
    expect(countriesOf("Berlin Office")).toEqual(["DE"]);
    expect(countriesOf("München")).toEqual(["DE"]);
    expect(countriesOf("Düsseldorf")).toEqual(["DE"]);
    expect(countriesOf("Brussel")).toEqual(["BE"]);
    expect(countriesOf("Warszawa, Masovian Voivodeship, Poland")).toEqual(["PL"]);
    expect(countriesOf("Stockholm HQ")).toEqual(["SE"]);
    expect(resolveLocation("Vienna, Vienna, Austria").city).toBe("Vienna");
  });

  it("lists every country of a multi-location posting", () => {
    expect(countriesOf("Berlin, Germany; Helsinki, Finland; Tallinn, Estonia")).toEqual(["DE", "FI", "EE"]);
    expect(countriesOf("Amsterdam; Madrid")).toEqual(["NL", "ES"]);
  });

  it("uses a state or province to tell cities with the same name apart", () => {
    expect(countriesOf("Cambridge")).toEqual(["GB"]);
    expect(countriesOf("Cambridge, Massachusetts")).toEqual(["US"]);
    expect(countriesOf("London, Ontario")).toEqual(["CA"]);
    expect(countriesOf("Atlanta, Georgia")).toEqual(["US"]);
    expect(countriesOf("Tbilisi, Georgia")).toEqual(["GE"]);
    expect(countriesOf("New York, NY, United States")).toEqual(["US"]);
  });

  it("uses structured hints from the source", () => {
    expect(countriesOf("Remote - European Union", ["Germany", "Sweden"])).toEqual(["DE", "SE"]);
    expect(countriesOf("HQ", ["DE"])).toEqual(["DE"]);
  });

  it("does not guess when the location says nothing about a place", () => {
    expect(countriesOf("Hybrid")).toEqual([]);
    expect(countriesOf("N/A")).toEqual([]);
    expect(countriesOf("")).toEqual([]);
    expect(countriesOf("Kleinkleckersdorf")).toEqual([]);
  });

  it("recognises regions for remote work", () => {
    expect(resolveLocation("Home based - EMEA").regions).toContain("europe");
    expect(resolveLocation("Worldwide").regions).toContain("worldwide");
    expect(resolveLocation("Remote - EU").regions).toContain("eu");
  });
});

describe("country matching (acceptance scenario 3)", () => {
  const selected = ["DE", "NL", "AT"];

  it("keeps listings in a selected country and drops the rest", () => {
    expect(matchCountries(resolveLocation("Vienna"), selected, { remote: false })).toMatchObject({
      matches: true,
      countryCode: "AT",
    });
    expect(matchCountries(resolveLocation("Paris, France"), selected, { remote: false })).toMatchObject({
      matches: false,
      reason: "other_country",
    });
    expect(matchCountries(resolveLocation("Hybrid"), selected, { remote: false })).toMatchObject({
      matches: false,
      reason: "unresolved",
    });
  });

  it("keeps remote listings only when their region covers a selected country", () => {
    expect(matchCountries(resolveLocation("Europe"), selected, { remote: true }).matches).toBe(true);
    expect(matchCountries(resolveLocation("Worldwide"), selected, { remote: true }).matches).toBe(true);
    expect(matchCountries(resolveLocation("USA, Canada"), selected, { remote: true }).matches).toBe(false);
    expect(matchCountries(resolveLocation("North America"), selected, { remote: true }).matches).toBe(false);
    // A region alone says nothing about where an on-site job is.
    expect(matchCountries(resolveLocation("Europe"), selected, { remote: false }).matches).toBe(false);
  });

  it("accepts every location when no country is selected", () => {
    expect(matchCountries(resolveLocation("Hybrid"), [], { remote: false }).matches).toBe(true);
  });

  it("returns only jobs in Germany, the Netherlands and Austria from a mixed feed", () => {
    const filters: ListingFilters = {
      keywords: ["Frontend Engineer"],
      countries: selected,
      workArrangements: [],
      requireSponsorship: false,
      excludeWorkAuthRequired: false,
      excludeNoSponsorship: false,
    };
    const job = (id: string, location: string): SourceJob => ({
      externalId: id,
      url: `https://example.com/jobs/${id}`,
      title: "Senior Frontend Engineer",
      company: "Example",
      location,
      descriptionText: "Build our web application with React and TypeScript.",
    });
    const feed = [
      job("1", "Berlin, Germany"),
      job("2", "Amsterdam"),
      job("3", "Wien"),
      job("4", "London, United Kingdom"),
      job("5", "Paris"),
      job("6", "San Francisco, CA"),
      job("7", "Hybrid"),
      job("8", "Graz, Austria; Zurich, Switzerland"),
    ];
    const kept = feed
      .map((item) => processSourceJob(item, { id: "test", label: "Test" }, filters))
      .flatMap((result) => (result.kind === "keep" ? [result.candidate] : []));
    expect(kept.map((candidate) => candidate.externalId)).toEqual(["1", "2", "3", "8"]);
    expect(kept.map((candidate) => candidate.countryCode)).toEqual(["DE", "NL", "AT", "AT"]);
    expect(kept.every((candidate) => selected.includes(candidate.countryCode!))).toBe(true);
  });
});
