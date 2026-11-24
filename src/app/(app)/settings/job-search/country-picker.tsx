"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/fields";

interface Country {
  code: string;
  name: string;
}

/**
 * Searchable multi-select for target countries. Selected countries are shown
 * as removable chips and submitted as repeated `countries` fields. Suggested
 * countries are listed first; every other country can be found by typing.
 */
export function CountryPicker({
  countries,
  suggested,
  initial,
}: {
  countries: Country[];
  suggested: string[];
  initial: string[];
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const byCode = useMemo(() => new Map(countries.map((country) => [country.code, country])), [countries]);

  const toggle = (code: string) =>
    setSelected((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));

  const needle = query.trim().toLowerCase();
  const options = (
    needle
      ? countries.filter(
          (country) => country.name.toLowerCase().includes(needle) || country.code.toLowerCase() === needle,
        )
      : [
          ...suggested.flatMap((code) => (byCode.has(code) ? [byCode.get(code)!] : [])),
          ...countries.filter((country) => !suggested.includes(country.code)),
        ]
  ).slice(0, 60);

  return (
    <div className="space-y-3">
      {selected.map((code) => (
        <input key={code} type="hidden" name="countries" value={code} />
      ))}
      <div className="flex min-h-9 flex-wrap gap-1.5" aria-live="polite">
        {selected.length === 0 ? (
          <span className="text-muted text-sm">No country selected: jobs in any country are kept.</span>
        ) : (
          selected.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => toggle(code)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-900 hover:bg-blue-200"
              aria-label={`Remove ${byCode.get(code)?.name ?? code}`}
            >
              {byCode.get(code)?.name ?? code}
              <span aria-hidden="true">×</span>
            </button>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search countries"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search all countries"
          className="max-w-xs"
        />
        <button
          type="button"
          className="text-primary text-sm font-medium hover:underline"
          onClick={() => setSelected((current) => [...new Set([...current, ...suggested])])}
        >
          Add all suggested
        </button>
        <button
          type="button"
          className="text-muted text-sm font-medium hover:underline"
          onClick={() => setSelected([])}
        >
          Clear
        </button>
      </div>
      <ul
        className="border-border grid max-h-56 gap-x-4 overflow-y-auto rounded-md border p-2 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Countries"
      >
        {options.length === 0 ? <li className="text-muted p-1 text-sm">No country matches.</li> : null}
        {options.map((country) => (
          <li key={country.code}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
              <input
                type="checkbox"
                className="accent-primary h-4 w-4"
                checked={selected.includes(country.code)}
                onChange={() => toggle(country.code)}
              />
              {country.name}
            </label>
          </li>
        ))}
      </ul>
      {!needle ? (
        <p className="text-muted text-xs">
          Suggested countries are listed first. Type to find any other country ({countries.length} available).
        </p>
      ) : null}
    </div>
  );
}
