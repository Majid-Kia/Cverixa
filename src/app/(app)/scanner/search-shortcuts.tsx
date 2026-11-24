"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Checkbox, Field, Select } from "@/components/ui/fields";
import {
  euresSource,
  indeedSource,
  linkedinSource,
  SPONSORSHIP_SEARCH_PHRASES,
  welcomeToTheJungleSource,
} from "@/features/job-scanner/sources/external-links";

const SOURCES = [linkedinSource, indeedSource, euresSource, welcomeToTheJungleSource];

/**
 * Links that open a search on sites the scanner is not permitted to read.
 * Nothing is fetched from these sites; the links open in the owner's browser.
 */
export function SearchShortcuts({
  keywords,
  countries,
}: {
  keywords: string[];
  countries: Array<{ code: string; name: string }>;
}) {
  const [keyword, setKeyword] = useState(keywords[0] ?? "");
  const [code, setCode] = useState(countries[0]?.code ?? "");
  const [sponsorship, setSponsorship] = useState(true);
  const country = countries.find((item) => item.code === code) ?? null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Job title" htmlFor="shortcut-keyword">
          <Select id="shortcut-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)}>
            {keywords.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country" htmlFor="shortcut-country">
          <Select id="shortcut-country" value={code} onChange={(event) => setCode(event.target.value)}>
            {countries.length === 0 ? <option value="">Any country</option> : null}
            {countries.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="border-border flex cursor-pointer gap-3 rounded-md border p-3">
        <Checkbox checked={sponsorship} onChange={(event) => setSponsorship(event.target.checked)} className="mt-0.5" />
        <span>
          <span className="block text-sm font-medium">Only postings that mention visa sponsorship or relocation</span>
          <span className="text-muted block text-sm">
            These sites have no sponsorship filter. This adds the phrases{" "}
            {SPONSORSHIP_SEARCH_PHRASES.map((phrase) => `"${phrase}"`).join(", ")} to the search, so only postings whose
            text contains one of them are listed. That includes postings saying sponsorship is not offered: import a
            posting to see what it actually states.
          </span>
        </span>
      </label>
      <ul className="space-y-2">
        {SOURCES.map((source) => {
          const url = keyword ? source.searchUrl(keyword, country, { sponsorship }) : null;
          return (
            <li
              key={source.id}
              className="border-border flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {source.displayName}
                  <Badge tone="warning">Linked externally, not scanned</Badge>
                </p>
                <p className="text-muted mt-1 text-xs">{source.limitation}</p>
                {sponsorship && !source.sponsorshipSearch ? (
                  <p className="text-muted mt-1 text-xs">
                    The sponsorship phrases are not added here; this site&apos;s search does not support them.
                  </p>
                ) : null}
              </div>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses("secondary", "sm", "shrink-0")}
                >
                  Open {source.displayName} search
                </a>
              ) : (
                <span className="text-muted shrink-0 text-xs">Not available for this country</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
