import type { Metadata } from "next";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { SettingsTabs } from "@/components/settings-tabs";
import { getAISettings } from "@/features/ai-settings/service";
import { SCAN_LIMITS, SUGGESTED_COUNTRY_CODES } from "@/features/job-scanner/constants";
import { COUNTRIES } from "@/features/job-scanner/countries";
import { getJobSearchPreferences, getSourceSettings } from "@/features/job-scanner/preferences-service";
import { formatInterval } from "@/features/job-scanner/scan-service";
import { listTimeZones } from "@/features/job-scanner/schedule";
import { formatBoards } from "@/features/job-scanner/sources/boards";
import { LINK_ONLY_SOURCES } from "@/features/job-scanner/sources/registry";
import { getEnv } from "@/lib/env";
import { requireUser } from "@/server/security/session";
import { PreferencesForm } from "./preferences-form";
import { SourceSettingsCard, type SourceCardData } from "./source-settings";

export const metadata: Metadata = { title: "Job Search Preferences" };
export const dynamic = "force-dynamic";

const BOARD_HINTS: Record<string, string> = {
  greenhouse:
    'The name in the company\'s Greenhouse address: boards.greenhouse.io/adyen is "adyen". Add "| Company name" to set the name shown.',
  ashby:
    'The name in the company\'s Ashby address: jobs.ashbyhq.com/lovable is "lovable". Add "| Company name" to set the name shown.',
  lever:
    'The name in the company\'s Lever address: jobs.lever.co/acme is "acme". Use "eu.acme" for companies on jobs.eu.lever.co.',
};

function field<T>(config: unknown, key: string): T | null {
  return config && typeof config === "object" && key in config ? ((config as Record<string, unknown>)[key] as T) : null;
}

export default async function JobSearchSettingsPage() {
  const user = await requireUser();
  const [preferences, sources, ai] = await Promise.all([
    getJobSearchPreferences(user.id),
    getSourceSettings(user.id),
    getAISettings(user.id),
  ]);
  const env = getEnv();
  const provider = ai.definitions.find((definition) => definition.id === ai.defaultProviderId);
  const internalScheduler = !["false", "0"].includes((process.env.JOB_SCAN_INTERNAL_SCHEDULER ?? "true").toLowerCase());
  const scheduleNote = [
    internalScheduler
      ? "This server checks for due scans itself once a minute while it is running."
      : "The in-process schedule check is turned off on this server (JOB_SCAN_INTERNAL_SCHEDULER).",
    env.CRON_SECRET
      ? "The cron endpoint /api/cron/job-scan is enabled for an external scheduler."
      : "The cron endpoint is disabled because CRON_SECRET is not set; set it if this server sleeps when idle.",
    "A run missed by up to 12 hours is made up once; an older one is skipped and recorded in the scan history.",
  ].join(" ");

  const cards: SourceCardData[] = sources.map(({ source, enabled, config }) => {
    const boards = field<Array<{ slug: string; name: string }>>(config, "boards");
    const limits = [
      `At most ${source.limits.maxRequestsPerScan} request${source.limits.maxRequestsPerScan === 1 ? "" : "s"} per scan.`,
      source.limits.minIntervalMinutes > 0
        ? `Read at most once every ${formatInterval(source.limits.minIntervalMinutes)}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      id: source.id,
      displayName: source.displayName,
      description: source.description,
      attribution: source.attribution,
      homepage: source.homepage,
      verified: source.verified,
      enabled,
      limits,
      boards: boards ? formatBoards(boards) : null,
      boardHint: BOARD_HINTS[source.id] ?? "",
      visaSponsorshipOnly: field<boolean>(config, "visaSponsorshipOnly"),
      maxPages: field<number>(config, "maxPages"),
      category: field<string>(config, "category"),
    };
  });

  return (
    <>
      <PageHeader
        title="Job Search Preferences"
        description="What the Job Scanner looks for, which postings it keeps, where it looks and when it runs."
      />
      <SettingsTabs current="/settings/job-search" />
      {!preferences.saved ? (
        <Alert tone="info" className="mb-4">
          These are the suggested starting values. Adjust them and save to make them yours.
        </Alert>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <PreferencesForm
          preferences={{
            countries: preferences.countries,
            keywords: preferences.keywords,
            workArrangements: preferences.workArrangements,
            requireSponsorship: preferences.requireSponsorship,
            preferRelocation: preferences.preferRelocation,
            excludeWorkAuthRequired: preferences.excludeWorkAuthRequired,
            excludeNoSponsorship: preferences.excludeNoSponsorship,
            aiMatchingEnabled: preferences.aiMatchingEnabled,
            maxAnalysesPerScan: preferences.maxAnalysesPerScan,
            rubric: preferences.rubric,
            scheduleEnabled: preferences.scheduleEnabled,
            scheduleTime: preferences.scheduleTime,
            scheduleTimezone: preferences.scheduleTimezone,
          }}
          countries={COUNTRIES}
          suggestedCountries={SUGGESTED_COUNTRY_CODES}
          timeZones={listTimeZones()}
          nextRun={
            preferences.nextRunAt
              ? `${preferences.nextRunAt.toLocaleString("en-GB", {
                  timeZone: preferences.scheduleTimezone,
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })} (${preferences.scheduleTimezone})`
              : null
          }
          provider={provider ? { label: `${provider.displayName} / ${ai.defaultModelId}`, paid: provider.paid } : null}
          analysisCeiling={SCAN_LIMITS.maxAnalysesPerScanCeiling}
          scheduleNote={scheduleNote}
        />
        <div className="space-y-4">
          <h2 id="sources" className="text-base font-semibold">
            Job sources
          </h2>
          {cards.map((card) => (
            <SourceSettingsCard key={card.id} source={card} />
          ))}
          <Card>
            <CardTitle>Sites that are linked, not scanned</CardTitle>
            <ul className="space-y-3">
              {LINK_ONLY_SOURCES.map((source) => (
                <li key={source.id}>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {source.displayName}
                    <Badge tone="warning">Linked externally, not scanned</Badge>
                  </p>
                  <p className="text-muted mt-1 text-sm">{source.limitation}</p>
                </li>
              ))}
            </ul>
            <p className="text-muted mt-3 text-xs">
              Search links for these sites are on the Job Scanner page. A posting you find there can be imported by
              pasting its link and text.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
