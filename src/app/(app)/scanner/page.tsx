import type { Metadata } from "next";
import Link from "next/link";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/fields";
import { getAISettings } from "@/features/ai-settings/service";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { tailorListingAction } from "@/features/job-scanner/actions";
import {
  LISTING_STATUSES,
  LISTING_STATUS_LABELS,
  SPONSORSHIP_LABELS,
  SPONSORSHIP_STATUSES,
  WORK_ARRANGEMENT_LABELS,
} from "@/features/job-scanner/constants";
import { countryName } from "@/features/job-scanner/countries";
import { getScannerSummary, listListings, type ListingSort } from "@/features/job-scanner/listings-service";
import { getJobSearchPreferences, getSourceSettings } from "@/features/job-scanner/preferences-service";
import { getScanState } from "@/features/job-scanner/scan-service";
import { LINK_ONLY_SOURCES, sourceLabel } from "@/features/job-scanner/sources/registry";
import { formatDateTime, truncate } from "@/lib/utils";
import { requireUser } from "@/server/security/session";
import { MatchScore, RelocationBadge, ScanStatusBadge, SponsorshipBadge } from "./badges";
import { ListingStatusSelect } from "./listing-status-select";
import { ScanPanel } from "./scan-panel";
import { SearchShortcuts } from "./search-shortcuts";

export const metadata: Metadata = { title: "Job Scanner" };
export const dynamic = "force-dynamic";

type Params = {
  country?: string;
  title?: string;
  sponsorship?: string;
  source?: string;
  arrangement?: string;
  minScore?: string;
  status?: string;
  sort?: string;
};

const SORTS: Array<{ value: ListingSort; label: string }> = [
  { value: "priority", label: "Sponsorship, then match score" },
  { value: "score", label: "Match score" },
  { value: "posted", label: "Publication date" },
  { value: "discovered", label: "Discovery date" },
];

function formatDate(value: Date | null): string {
  if (!value) return "";
  return value.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="border-border bg-surface rounded-lg border p-4 shadow-sm">
      <p className="text-muted text-xs font-medium tracking-wide uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-muted mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

export default async function ScannerPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const [preferences, sources, scans, profile, ai] = await Promise.all([
    getJobSearchPreferences(user.id),
    getSourceSettings(user.id),
    getScanState(user.id),
    getProfileSnapshot(user.id),
    getAISettings(user.id),
  ]);
  const sort = SORTS.some((option) => option.value === params.sort) ? (params.sort as ListingSort) : "priority";
  const minScore = Number(params.minScore) > 0 ? Math.min(100, Number(params.minScore)) : 0;
  const [summary, results] = await Promise.all([
    getScannerSummary(user.id, {
      lastScanId: scans.last?.id ?? null,
      highRelevanceThreshold: preferences.rubric.highRelevanceThreshold,
    }),
    listListings(user.id, {
      country: params.country,
      title: params.title,
      sponsorship: params.sponsorship,
      source: params.source,
      arrangement: params.arrangement,
      minScore,
      status: params.status,
      sort,
    }),
  ]);
  const enabledSources = sources.filter((setting) => setting.enabled);
  const profileReady = Boolean(profile.revisionId && profile.confirmedAt);
  const providerReady = Boolean(ai.defaultProviderId && ai.defaultModelId);
  const provider = ai.definitions.find((definition) => definition.id === ai.defaultProviderId);
  const filtered = Object.entries(params).some(([key, value]) => key !== "sort" && Boolean(value));
  const scanStatus = scans.running ? "running" : (scans.last?.status ?? null);

  return (
    <>
      <PageHeader
        title="Job Scanner"
        description="Finds jobs in your target countries, states what each posting says about visa sponsorship, and scores them against your confirmed profile."
        actions={
          <>
            <LinkButton href="/scanner/import" variant="secondary">
              Import a posting
            </LinkButton>
            <LinkButton href="/scanner/history" variant="secondary">
              Scan history
            </LinkButton>
            <LinkButton href="/settings/job-search" variant="secondary">
              Preferences
            </LinkButton>
          </>
        }
      />

      {!preferences.saved ? (
        <Alert tone="info" className="mb-4" title="Using the suggested search preferences">
          Scans use the suggested countries and job titles until you save your own.{" "}
          <Link href="/settings/job-search" className="font-medium underline">
            Review Job Search Preferences
          </Link>
          .
        </Alert>
      ) : null}
      {!profileReady ? (
        <Alert tone="warning" className="mb-4" title="Master profile not confirmed">
          Jobs are still discovered, but Job Match Scores need a confirmed profile.{" "}
          <Link href="/profile" className="font-medium underline">
            Confirm your profile
          </Link>
          .
        </Alert>
      ) : null}
      {preferences.aiMatchingEnabled && !providerReady ? (
        <Alert tone="warning" className="mb-4" title="No default AI provider">
          Jobs are still discovered and sponsorship is still classified from the posting text, but listings are not
          scored.{" "}
          <Link href="/settings" className="font-medium underline">
            Choose a provider and model
          </Link>
          .
        </Alert>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardTitle>Scan</CardTitle>
          <ScanPanel
            running={
              scans.running
                ? {
                    id: scans.running.id,
                    status: scans.running.status,
                    progress: scans.running.progress,
                    discoveredCount: scans.running.discoveredCount,
                    newCount: scans.running.newCount,
                    duplicateCount: scans.running.duplicateCount,
                    analyzedCount: scans.running.analyzedCount,
                    errorSummary: scans.running.errorSummary,
                  }
                : null
            }
            disabled={enabledSources.length === 0}
          />
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted text-xs">Scan status</dt>
              <dd className="mt-1">{scanStatus ? <ScanStatusBadge status={scanStatus} /> : "No scan yet"}</dd>
            </div>
            <div>
              <dt className="text-muted text-xs">Last scan</dt>
              <dd className="mt-1">
                {scans.last ? (
                  <Link href={`/scanner/history/${scans.last.id}`} className="text-primary hover:underline">
                    {formatDateTime(scans.last.finishedAt ?? scans.last.startedAt)}
                  </Link>
                ) : (
                  "Never"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted text-xs">Next scheduled scan</dt>
              <dd className="mt-1">
                {preferences.scheduleEnabled && preferences.nextRunAt ? (
                  <>
                    {formatDateTime(preferences.nextRunAt)}{" "}
                    <span className="text-muted text-xs">
                      (daily at {preferences.scheduleTime}, {preferences.scheduleTimezone})
                    </span>
                  </>
                ) : (
                  <Link href="/settings/job-search#schedule" className="text-primary hover:underline">
                    Automatic scanning is off
                  </Link>
                )}
              </dd>
            </div>
          </dl>
          {scans.last?.errorSummary && !scans.running ? (
            <p className="text-muted mt-3 text-xs">Last scan: {truncate(scans.last.errorSummary, 300)}</p>
          ) : null}
        </Card>
        <Card>
          <CardTitle>Sources</CardTitle>
          <ul className="space-y-2 text-sm">
            {sources.map((setting) => (
              <li key={setting.source.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{setting.source.displayName}</span>
                <span className="flex flex-wrap items-center gap-1">
                  {setting.enabled ? (
                    <Badge tone="success">Scanned automatically</Badge>
                  ) : (
                    <Badge tone="neutral">Off</Badge>
                  )}
                  {setting.source.verified ? null : <Badge tone="warning">Not verified live</Badge>}
                </span>
              </li>
            ))}
            {LINK_ONLY_SOURCES.map((source) => (
              <li key={source.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{source.displayName}</span>
                <Badge tone="warning">Linked externally, not scanned</Badge>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-3 text-xs">
            {provider && preferences.aiMatchingEnabled
              ? `Matching uses ${provider.displayName} / ${ai.defaultModelId}${provider.paid ? " (usage may incur charges)" : ""}, up to ${preferences.maxAnalysesPerScan} listings per scan.`
              : "AI matching is not active."}{" "}
            <Link href="/settings/job-search#sources" className="text-primary hover:underline">
              Manage sources
            </Link>
          </p>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Jobs discovered" value={summary.total} />
        <Stat label="New since previous scan" value={summary.newSinceLastScan} />
        <Stat label="Confirmed sponsorship" value={summary.confirmed} hint="Stated in the posting" />
        <Stat label="Possible sponsorship" value={summary.possible} hint="Related evidence only" />
        <Stat
          label="High-relevance matches"
          value={summary.highRelevance}
          hint={`Score ${preferences.rubric.highRelevanceThreshold} or higher`}
        />
      </div>

      <Card className="mb-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Job title" htmlFor="filter-title">
            <Input id="filter-title" name="title" defaultValue={params.title ?? ""} placeholder="Any title" />
          </Field>
          <Field label="Country" htmlFor="filter-country">
            <Select id="filter-country" name="country" defaultValue={params.country ?? ""}>
              <option value="">Any country</option>
              {summary.countries.map((code) => (
                <option key={code} value={code}>
                  {countryName(code)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sponsorship" htmlFor="filter-sponsorship">
            <Select id="filter-sponsorship" name="sponsorship" defaultValue={params.sponsorship ?? ""}>
              <option value="">Any status</option>
              {SPONSORSHIP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {SPONSORSHIP_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Source" htmlFor="filter-source">
            <Select id="filter-source" name="source" defaultValue={params.source ?? ""}>
              <option value="">Any source</option>
              {summary.sources.map((id) => (
                <option key={id} value={id}>
                  {sourceLabel(id)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Work arrangement" htmlFor="filter-arrangement">
            <Select id="filter-arrangement" name="arrangement" defaultValue={params.arrangement ?? ""}>
              <option value="">Any arrangement</option>
              {(["onsite", "hybrid", "remote", "unknown"] as const).map((value) => (
                <option key={value} value={value}>
                  {WORK_ARRANGEMENT_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum match score" htmlFor="filter-score">
            <Input
              id="filter-score"
              name="minScore"
              type="number"
              min={0}
              max={100}
              step={5}
              defaultValue={minScore || ""}
              placeholder="0"
            />
          </Field>
          <Field label="Status" htmlFor="filter-status">
            <Select id="filter-status" name="status" defaultValue={params.status ?? "active"}>
              <option value="active">Active (not dismissed or rejected)</option>
              <option value="all">All</option>
              {LISTING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LISTING_STATUS_LABELS[status]}
                  {summary.byStatus[status] ? ` (${summary.byStatus[status]})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sort by" htmlFor="filter-sort">
            <Select id="filter-sort" name="sort" defaultValue={sort}>
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
            {filtered ? (
              <LinkButton href="/scanner" variant="ghost" size="sm">
                Clear
              </LinkButton>
            ) : null}
            <span className="text-muted ml-auto text-sm">
              Showing {results.listings.length} of {results.total}
            </span>
          </div>
        </form>
      </Card>

      {results.listings.length === 0 ? (
        <EmptyState
          title={summary.total === 0 ? "No jobs discovered yet" : "No jobs match these filters"}
          description={
            summary.total === 0
              ? "Start a scan to search your sources for the job titles and countries in your preferences."
              : "Change or clear the filters to see more listings."
          }
        />
      ) : (
        <ul className="space-y-3">
          {results.listings.map((listing) => (
            <li key={listing.id}>
              <Card className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <MatchScore score={listing.matchScore} />
                    <div className="min-w-0">
                      <Link href={`/scanner/${listing.id}`} className="text-primary font-semibold hover:underline">
                        {truncate(listing.title, 110)}
                      </Link>
                      <p className="text-sm">
                        <span className="font-medium">{listing.company}</span>
                        <span className="text-muted">
                          {" · "}
                          {listing.countryCode ? `${countryName(listing.countryCode)} · ` : ""}
                          {listing.location}
                          {" · "}
                          {WORK_ARRANGEMENT_LABELS[listing.workArrangement]}
                        </span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <SponsorshipBadge status={listing.sponsorshipStatus} />
                        <RelocationBadge status={listing.relocationStatus} />
                        {listing.workAuthRequired ? <Badge tone="warning">Work authorisation required</Badge> : null}
                        <Badge>
                          {sourceLabel(listing.sourceId)}
                          {listing.ingestion === "manual" ? " (imported)" : ""}
                        </Badge>
                      </div>
                      <p className="text-muted mt-2 text-xs">
                        {listing.postedAt
                          ? `Published ${formatDate(listing.postedAt)} · `
                          : "Publication date unknown · "}
                        discovered {formatDate(listing.discoveredAt)}
                      </p>
                      {listing.matchingSkills.length > 0 ? (
                        <p className="mt-2 text-xs">
                          <span className="font-medium">Matching skills:</span>{" "}
                          <span className="text-muted">{listing.matchingSkills.slice(0, 8).join(", ")}</span>
                        </p>
                      ) : null}
                      {listing.missingQualifications.length > 0 ? (
                        <p className="mt-1 text-xs">
                          <span className="font-medium">Not evidenced in your profile:</span>{" "}
                          <span className="text-muted">
                            {listing.missingQualifications
                              .slice(0, 3)
                              .map((item) => truncate(item.description, 70))
                              .join("; ")}
                            {listing.missingQualifications.length > 3
                              ? ` and ${listing.missingQualifications.length - 3} more`
                              : ""}
                          </span>
                        </p>
                      ) : null}
                      {listing.analysisFailure ? (
                        <p className="text-warning mt-1 text-xs">
                          Analysis failed: {truncate(listing.analysisFailure, 140)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <ListingStatusSelect listingId={listing.id} title={listing.title} status={listing.status} />
                    <form action={tailorListingAction}>
                      <input type="hidden" name="id" value={listing.id} />
                      <Button type="submit" size="sm">
                        Tailor Resume for This Job
                      </Button>
                    </form>
                    <a
                      href={listing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Original posting
                    </a>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-6">
        <CardTitle>Search sites that cannot be scanned</CardTitle>
        <p className="text-muted mb-3 text-sm">
          These sites do not offer a permitted way to read their listings automatically, so Cverixa does not scan them.
          Open a search in your browser, then{" "}
          <Link href="/scanner/import" className="text-primary font-medium hover:underline">
            import a posting
          </Link>{" "}
          you want to track, score and tailor a resume for.
        </p>
        <SearchShortcuts
          keywords={preferences.keywords}
          countries={preferences.countries.map((code) => ({ code, name: countryName(code) }))}
        />
      </Card>
    </>
  );
}
