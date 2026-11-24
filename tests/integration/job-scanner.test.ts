/**
 * Job Scanner end to end against a real database, with every job source
 * answered from recorded-shape fixtures and the deterministic mock AI
 * provider. Covers the acceptance scenarios: manual scan, scheduled scan,
 * country filtering, sponsorship classification, duplicate detection, partial
 * source failure and the hand-off to resume tailoring.
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ALL_SOURCES_OK,
  ARBEITNOW_PAGE,
  ASHBY_BOARD,
  GREENHOUSE_BOARD,
  mockFetch,
  REMOTIVE_FEED,
} from "../fixtures/job-sources";
import { sampleProfile } from "../fixtures/profiles";
import { startTestDatabase, type TestDatabase } from "../helpers/embedded-db";

let db: TestDatabase;
let ownerId: string;
let otherId: string;

type Modules = {
  prisma: (typeof import("@/server/database/client"))["prisma"];
  profile: typeof import("@/features/career-profile/service");
  settings: typeof import("@/features/ai-settings/service");
  tailoring: typeof import("@/features/resume-tailoring/service");
  jobs: typeof import("@/features/job-analysis/service");
  preferences: typeof import("@/features/job-scanner/preferences-service");
  scans: typeof import("@/features/job-scanner/scan-service");
  listings: typeof import("@/features/job-scanner/listings-service");
  analysis: typeof import("@/features/job-scanner/analysis-service");
  scheduler: typeof import("@/features/job-scanner/scheduler");
  registry: typeof import("@/features/job-scanner/sources/registry");
  ai: typeof import("@/server/ai/registry");
  aiTypes: typeof import("@/server/ai/types");
};
let m: Modules;

const CRON_SECRET = "integration-cron-secret-0123456789";
const noSleep = async () => undefined;

const PREFERENCES = {
  countries: ["DE", "NL", "AT"],
  keywords: ["Frontend Engineer", "React Developer", "Frontend Tech Lead"],
  workArrangements: ["onsite", "hybrid", "remote"],
  requireSponsorship: false,
  preferRelocation: true,
  excludeWorkAuthRequired: true,
  excludeNoSponsorship: true,
  aiMatchingEnabled: true,
  maxAnalysesPerScan: 25,
  rubric: {
    weights: { mandatory: 40, skills: 25, preferred: 15, title: 10, seniority: 10 },
    highRelevanceThreshold: 70,
  },
  scheduleEnabled: false,
  scheduleTime: "05:00",
  scheduleTimezone: "Europe/Amsterdam",
};

/** The four verified sources, pointed at the fixture boards. */
function sourceSettings() {
  const source = (id: string) => m.registry.getAutomaticSource(id)!;
  return [
    { source: source("arbeitnow"), enabled: true, config: { visaSponsorshipOnly: true, maxPages: 1 } },
    { source: source("greenhouse"), enabled: true, config: { boards: [{ slug: "kanaal", name: "Kanaal" }] } },
    { source: source("ashby"), enabled: true, config: { boards: [{ slug: "nordlicht", name: "Nordlicht Software" }] } },
    { source: source("remotive"), enabled: true, config: { category: "software-dev" } },
  ];
}

/**
 * Run one scan. Sources have a minimum interval between reads; unless a test
 * is about that interval, earlier reads are moved into the past first so every
 * source is queried again.
 */
async function scan(
  owner: string,
  routes = ALL_SOURCES_OK,
  trigger: "manual" | "scheduled" = "manual",
  sources = sourceSettings(),
  options: { keepIntervals?: boolean } = {},
) {
  if (!options.keepIntervals) {
    await m.prisma.jobScanSourceResult.updateMany({
      where: { scan: { ownerId: owner } },
      data: { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });
  }
  const { fetchImpl, calls } = mockFetch(routes);
  const { scanId } = await m.scans.startScan(owner, trigger);
  await m.scans.executeScan(scanId, { fetchImpl, sleep: noSleep, sources, aiRetryDelayMs: 0 });
  return { scanId, calls, detail: await m.scans.getScanDetail(owner, scanId) };
}

async function setUpOwner(email: string): Promise<string> {
  const user = await m.prisma.user.create({ data: { email, passwordHash: "x" } });
  await m.profile.saveProfileRevision(user.id, sampleProfile(), { confirmed: true });
  await m.settings.saveProviderSetting(user.id, {
    providerId: "mock",
    modelId: "mock-deterministic-v1",
    makeDefault: true,
  });
  await m.preferences.saveJobSearchPreferences(user.id, PREFERENCES);
  return user.id;
}

const byTitle = async (owner: string, title: string) => {
  const { listings } = await m.listings.listListings(owner, { status: "all", sort: "discovered" });
  const found = listings.find((listing) => listing.title === title);
  if (!found) throw new Error(`listing "${title}" not found among ${listings.map((item) => item.title).join(", ")}`);
  return found;
};

beforeAll(async () => {
  db = await startTestDatabase({ isolated: { name: "cverixa_scanner_test", port: 54331 } });
  process.env.DATABASE_URL = db.url;
  process.env.AI_ENABLE_MOCK_PROVIDER = "true";
  process.env.CRON_SECRET = CRON_SECRET;
  m = {
    prisma: (await import("@/server/database/client")).prisma,
    profile: await import("@/features/career-profile/service"),
    settings: await import("@/features/ai-settings/service"),
    tailoring: await import("@/features/resume-tailoring/service"),
    jobs: await import("@/features/job-analysis/service"),
    preferences: await import("@/features/job-scanner/preferences-service"),
    scans: await import("@/features/job-scanner/scan-service"),
    listings: await import("@/features/job-scanner/listings-service"),
    analysis: await import("@/features/job-scanner/analysis-service"),
    scheduler: await import("@/features/job-scanner/scheduler"),
    registry: await import("@/features/job-scanner/sources/registry"),
    ai: await import("@/server/ai/registry"),
    aiTypes: await import("@/server/ai/types"),
  };
  await m.prisma.user.deleteMany();
  ownerId = await setUpOwner("scanner-owner@example.com");
  otherId = await setUpOwner("scanner-other@example.com");
}, 240_000);

afterAll(async () => {
  await m?.prisma.$disconnect();
  await db?.stop();
});

describe("job search preferences", () => {
  it("returns the suggested defaults until the owner saves", async () => {
    const fresh = await m.prisma.user.create({ data: { email: "scanner-fresh@example.com", passwordHash: "x" } });
    const view = await m.preferences.getJobSearchPreferences(fresh.id);
    expect(view.saved).toBe(false);
    expect(view.countries).toEqual(expect.arrayContaining(["DE", "NL", "QA", "SG"]));
    expect(view.keywords).toContain("Senior Frontend Engineer");
    expect(view.requireSponsorship).toBe(false);
    const sources = await m.preferences.getSourceSettings(fresh.id);
    expect(sources.find((item) => item.source.id === "lever")?.enabled).toBe(false);
    expect(sources.find((item) => item.source.id === "arbeitnow")?.enabled).toBe(true);
  });

  it("saves and reloads every preference, including countries outside the suggestions", async () => {
    const saved = await m.preferences.saveJobSearchPreferences(otherId, {
      ...PREFERENCES,
      countries: ["de", "JP", "JP", "BR"],
      keywords: ["React Engineer", "react engineer", "  Staff Frontend Engineer  "],
      workArrangements: ["remote"],
      requireSponsorship: true,
      maxAnalysesPerScan: 5,
      rubric: {
        weights: { mandatory: 50, skills: 20, preferred: 10, title: 10, seniority: 10 },
        highRelevanceThreshold: 80,
      },
    });
    expect(saved.countries).toEqual(["DE", "JP", "BR"]);
    expect(saved.keywords).toEqual(["react engineer", "Staff Frontend Engineer"]);
    const view = await m.preferences.getJobSearchPreferences(otherId);
    expect(view).toMatchObject({
      saved: true,
      workArrangements: ["remote"],
      requireSponsorship: true,
      maxAnalysesPerScan: 5,
      nextRunAt: null,
    });
    expect(view.rubric.highRelevanceThreshold).toBe(80);
    await m.preferences.saveJobSearchPreferences(otherId, PREFERENCES);
  });

  it("rejects invalid preferences with a readable message", async () => {
    const save = (patch: Record<string, unknown>) =>
      m.preferences.saveJobSearchPreferences(otherId, { ...PREFERENCES, ...patch });
    await expect(save({ countries: ["XX"] })).rejects.toThrow(/Unknown country/);
    await expect(save({ keywords: [] })).rejects.toThrow(/at least one job title/);
    await expect(save({ scheduleTime: "5am" })).rejects.toThrow(/24-hour time/);
    await expect(save({ scheduleTimezone: "Europe/Atlantis" })).rejects.toThrow(/Unknown time zone/);
    await expect(save({ maxAnalysesPerScan: 5000 })).rejects.toThrow();
  });

  it("computes the next run in the chosen time zone and clears it when the schedule is turned off", async () => {
    const now = new Date("2027-07-01T10:00:00Z");
    const enabled = await m.preferences.saveJobSearchPreferences(
      otherId,
      { ...PREFERENCES, scheduleEnabled: true, scheduleTime: "05:00", scheduleTimezone: "Europe/Amsterdam" },
      now,
    );
    // 05:00 in Amsterdam is 03:00 UTC in summer.
    expect(enabled.nextRunAt?.toISOString()).toBe("2027-07-02T03:00:00.000Z");
    const winter = await m.preferences.saveJobSearchPreferences(
      otherId,
      { ...PREFERENCES, scheduleEnabled: true, scheduleTime: "05:00", scheduleTimezone: "Europe/Amsterdam" },
      new Date("2027-01-10T03:00:00Z"),
    );
    expect(winter.nextRunAt?.toISOString()).toBe("2027-01-10T04:00:00.000Z");
    const disabled = await m.preferences.saveJobSearchPreferences(otherId, PREFERENCES, now);
    expect(disabled.nextRunAt).toBeNull();
  });

  it("validates per-source settings", async () => {
    await m.preferences.saveSourceSetting(otherId, {
      sourceId: "greenhouse",
      enabled: true,
      config: { boards: [{ slug: "kanaal", name: "Kanaal" }] },
    });
    const settings = await m.preferences.getSourceSettings(otherId);
    expect(settings.find((item) => item.source.id === "greenhouse")?.config).toEqual({
      boards: [{ slug: "kanaal", name: "Kanaal" }],
    });
    await expect(
      m.preferences.saveSourceSetting(otherId, {
        sourceId: "greenhouse",
        enabled: true,
        config: { boards: [{ slug: "../../admin", name: "x" }] },
      }),
    ).rejects.toThrow(/not valid/);
    await expect(
      m.preferences.saveSourceSetting(otherId, { sourceId: "linkedin", enabled: true, config: {} }),
    ).rejects.toThrow(/Unknown job source/);
  });
});

describe("manual scan (scenario 1)", () => {
  let first: Awaited<ReturnType<typeof scan>>;

  it("finds, filters, classifies, saves and scores listings", async () => {
    first = await scan(ownerId);
    const { detail } = first;
    expect(detail.status).toBe("completed");
    expect(detail.trigger).toBe("manual");
    expect(detail.finishedAt).not.toBeNull();
    expect(detail.sources).toEqual(["arbeitnow", "greenhouse", "ashby", "remotive"]);
    expect(detail.countries).toEqual(["DE", "NL", "AT"]);
    expect(detail.discoveredCount).toBe(5);
    expect(detail.newCount).toBe(5);
    // The Nordlicht job is on Arbeitnow and on the company's Ashby board.
    expect(detail.duplicateCount).toBe(1);
    expect(detail.analyzedCount).toBe(5);
    expect(detail.errorSummary).toBeNull();
    expect(detail.progress?.phase).toBe("done");
    const fetched =
      ARBEITNOW_PAGE.data.length +
      GREENHOUSE_BOARD.jobs.length +
      (ASHBY_BOARD.jobs.length - 1) +
      REMOTIVE_FEED.jobs.length;
    expect(detail.diagnostics.fetched).toBe(fetched);
    expect(detail.diagnostics.skipped).toMatchObject({ title: 1, other_country: 3, no_sponsorship: 1 });
  });

  it("returns only jobs in the selected countries (scenario 3)", async () => {
    const { listings, total } = await m.listings.listListings(ownerId, { status: "all" });
    expect(total).toBe(5);
    for (const listing of listings) {
      // A remote listing open to all of Europe has no single country.
      expect([...PREFERENCES.countries, null]).toContain(listing.countryCode);
    }
    expect(listings.map((listing) => listing.company)).not.toContain("Thames Digital Ltd");
    expect(listings.map((listing) => listing.location)).not.toContain("New York, NY");
    expect(
      listings.filter((listing) => listing.countryCode === null).map((listing) => listing.workArrangement),
    ).toEqual(["remote"]);
    const german = await m.listings.listListings(ownerId, { status: "all", country: "DE" });
    expect(german.listings.map((listing) => listing.company).sort()).toEqual([
      "Alpenblick AG",
      "Nordlicht Software GmbH",
    ]);
  });

  it("confirms sponsorship only with evidence from the posting (scenario 4)", async () => {
    const listing = await byTitle(ownerId, "Senior Frontend Engineer (m/f/d)");
    expect(listing.sponsorshipStatus).toBe("confirmed");
    const offer = listing.sponsorshipEvidence.find((item) => item.reading === "offers");
    expect(offer?.text).toContain("We offer visa sponsorship and a relocation package");
    expect(offer?.sourceUrl).toBe(listing.url);
    expect(listing.relocationStatus).toBe("offered");
    expect(listing.url).toBe("https://www.arbeitnow.com/jobs/companies/nordlicht/senior-frontend-engineer-berlin-1001");
  });

  it("does not confirm sponsorship without a statement in the posting (scenario 5)", async () => {
    const silent = await byTitle(ownerId, "Frontend Tech Lead");
    expect(silent.sponsorshipStatus).toBe("unknown");
    expect(silent.sponsorshipEvidence).toEqual([]);
    // Listed by the board under visa sponsorship, but the posting does not say so.
    const flagged = await byTitle(ownerId, "React Developer");
    expect(flagged.sponsorshipStatus).toBe("possible");
    expect(flagged.sponsorshipEvidence[0].basis).toBe("source_flag");
    const hedged = await byTitle(ownerId, "Staff Frontend Engineer");
    expect(hedged.sponsorshipStatus).toBe("possible");
    const { listings } = await m.listings.listListings(ownerId, { status: "all" });
    for (const listing of listings.filter((item) => item.sponsorshipStatus === "confirmed")) {
      expect(listing.sponsorshipEvidence.some((item) => item.reading === "offers")).toBe(true);
    }
  });

  it("orders confirmed sponsorship first, then possible, then unknown", async () => {
    const { listings } = await m.listings.listListings(ownerId, { status: "all", sort: "priority" });
    const order = listings.map((listing) => listing.sponsorshipStatus);
    expect(order).toEqual(
      [...order].sort(
        (a, b) =>
          ["confirmed", "possible", "unknown", "none"].indexOf(a) -
          ["confirmed", "possible", "unknown", "none"].indexOf(b),
      ),
    );
    expect(order[0]).toBe("confirmed");
  });

  it("scores each listing against the confirmed profile with an explanation and evidence", async () => {
    const summary = await byTitle(ownerId, "Senior Frontend Engineer (m/f/d)");
    expect(summary.matchScore).toBeGreaterThanOrEqual(70);
    expect(summary.matchingSkills).toEqual(expect.arrayContaining(["react", "typescript"]));
    const detail = await m.listings.getListing(ownerId, summary.id);
    expect(detail.explanation).toMatch(/mandatory requirements/);
    expect(detail.breakdown?.components.map((component) => component.id)).toEqual([
      "mandatory",
      "skills",
      "preferred",
      "title",
      "seniority",
    ]);
    expect(detail.breakdown?.matchingQualifications[0].evidence.length).toBeGreaterThan(0);
    expect(detail.requirements.length).toBeGreaterThan(0);
    expect(detail.analysisProvider).toContain("mock");
    expect(detail.description).toContain("Own our React and TypeScript booking flow");
    expect(detail.description).not.toMatch(/<[a-z]/i);
    expect(detail.events.map((event) => event.type)).toEqual(["discovered"]);
  });

  it("filters and sorts the results", async () => {
    const list = (filters: Parameters<typeof m.listings.listListings>[1]) =>
      m.listings.listListings(ownerId, { status: "all", ...filters }).then((result) => result.listings);
    expect((await list({ sponsorship: "confirmed" })).map((item) => item.company)).toEqual(["Nordlicht Software GmbH"]);
    expect((await list({ source: "greenhouse" })).map((item) => item.title)).toEqual(["Staff Frontend Engineer"]);
    expect((await list({ arrangement: "remote" })).length).toBe(2);
    expect((await list({ title: "tech lead" })).map((item) => item.title)).toEqual(["Frontend Tech Lead"]);
    expect((await list({ minScore: 101 })).length).toBe(0);
    const byScore = await list({ sort: "score" });
    const scores = byScore.map((item) => item.matchScore ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const byPosted = await list({ sort: "posted" });
    const posted = byPosted.map((item) => item.postedAt?.getTime() ?? 0);
    expect(posted).toEqual([...posted].sort((a, b) => b - a));
    const summary = await m.listings.getScannerSummary(ownerId, {
      lastScanId: first.scanId,
      highRelevanceThreshold: 70,
    });
    expect(summary).toMatchObject({ total: 5, newSinceLastScan: 5, confirmed: 1, possible: 2 });
    expect(summary.countries).toEqual(["DE", "NL"]);
    expect(summary.highRelevance).toBeGreaterThanOrEqual(1);
  });

  it("does not send the candidate's profile to any job source", async () => {
    const profile = sampleProfile();
    for (const call of first.calls) {
      expect(call.url).not.toContain(encodeURIComponent(profile.personal.fullName));
      expect(call.url).not.toContain("Alex");
      expect(call.url).not.toContain("example.com");
    }
    const hosts = new Set(first.calls.map((call) => new URL(call.url).hostname));
    expect([...hosts].sort()).toEqual([
      "api.ashbyhq.com",
      "boards-api.greenhouse.io",
      "remotive.com",
      "www.arbeitnow.com",
    ]);
  });
});

describe("concurrency and rate limits", () => {
  it("refuses a second scan while one is running and allows one afterwards", async () => {
    const running = await m.scans.startScan(ownerId, "manual");
    await expect(m.scans.startScan(ownerId, "manual")).rejects.toMatchObject({ code: "scan_running" });
    // Another owner is not blocked.
    const other = await m.scans.startScan(otherId, "manual");
    await m.prisma.jobScan.updateMany({
      where: { id: { in: [running.scanId, other.scanId] } },
      data: { status: "failed", activeLock: null, finishedAt: new Date() },
    });
    const again = await m.scans.startScan(ownerId, "manual");
    await m.prisma.jobScan.update({
      where: { id: again.scanId },
      data: { status: "failed", activeLock: null, finishedAt: new Date() },
    });
  });

  it("recovers from a scan that stopped reporting", async () => {
    const stuck = await m.scans.startScan(ownerId, "manual");
    await m.prisma.jobScan.update({
      where: { id: stuck.scanId },
      data: { heartbeatAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    const next = await m.scans.startScan(ownerId, "manual");
    const interrupted = await m.scans.getScan(ownerId, stuck.scanId);
    expect(interrupted.status).toBe("failed");
    expect(interrupted.errorSummary).toMatch(/interrupted/);
    await m.prisma.jobScan.update({
      where: { id: next.scanId },
      data: { status: "failed", activeLock: null, finishedAt: new Date() },
    });
  });

  it("respects a source's minimum interval between scans", async () => {
    // Remotive and Arbeitnow were read by the first scan moments ago.
    const { detail, calls } = await scan(ownerId, ALL_SOURCES_OK, "manual", sourceSettings(), { keepIntervals: true });
    const remotive = detail.sourceResults.find((result) => result.sourceId === "remotive");
    expect(remotive?.status).toBe("skipped");
    expect(remotive?.error).toMatch(/Read less than 6 hours ago/);
    expect(detail.sourceResults.find((result) => result.sourceId === "arbeitnow")?.error).toMatch(
      /Read less than 30 minutes ago/,
    );
    expect(calls.some((call) => /remotive.com|arbeitnow.com/.test(call.url))).toBe(false);
    // Sources without a stated limit are read again; a skipped source is not a failure.
    expect(detail.sourceResults.find((result) => result.sourceId === "greenhouse")?.status).toBe("completed");
    expect(detail.status).toBe("completed");
  });
});

describe("repeated scans (scenario 6)", () => {
  it("creates no duplicates, keeps the owner's status and does not analyse unchanged postings again", async () => {
    const tracked = await byTitle(ownerId, "Staff Frontend Engineer");
    await m.listings.setListingStatus(ownerId, tracked.id, "applied");
    const before = await m.prisma.jobListing.count({ where: { ownerId } });
    const provider = m.ai.getProvider("mock");
    using generate = vi.spyOn(provider, "generateStructured");

    const { detail } = await scan(ownerId);
    expect(detail.newCount).toBe(0);
    expect(detail.discoveredCount).toBe(5);
    // Five already known, plus the copy of the Nordlicht job on a second source.
    expect(detail.duplicateCount).toBe(6);
    expect(await m.prisma.jobListing.count({ where: { ownerId } })).toBe(before);
    expect(generate).not.toHaveBeenCalled();
    expect(detail.analyzedCount).toBe(0);

    const after = await m.listings.getListing(ownerId, tracked.id);
    expect(after.status).toBe("applied");
    expect(after.matchScore).toBe(tracked.matchScore);
    expect(after.events.map((event) => event.type)).toEqual(["status_changed", "discovered"]);
    const row = await m.prisma.jobListing.findUniqueOrThrow({ where: { id: tracked.id } });
    expect(row.seenCount).toBeGreaterThanOrEqual(3);
    expect(row.lastSeenAt.getTime()).toBeGreaterThan(row.discoveredAt.getTime());
    const summary = await m.listings.getScannerSummary(ownerId, { lastScanId: detail.id, highRelevanceThreshold: 70 });
    expect(summary.newSinceLastScan).toBe(0);
  });

  it("updates listing metadata and re-analyses only the posting whose text changed", async () => {
    const changed = structuredClone(GREENHOUSE_BOARD);
    changed.jobs[0].title = "Staff Frontend Engineer";
    changed.jobs[0].location = { name: "Amsterdam (Hybrid), Netherlands" };
    changed.jobs[0].content = changed.jobs[0].content.replace(
      "Visa sponsorship may be available for exceptional candidates.",
      "We offer visa sponsorship and handle your work permit.",
    );
    const routes = [{ match: "boards-api.greenhouse.io/v1/boards/kanaal/jobs", body: changed }, ...ALL_SOURCES_OK];
    const provider = m.ai.getProvider("mock");
    using generate = vi.spyOn(provider, "generateStructured");
    const before = await byTitle(ownerId, "Staff Frontend Engineer");
    expect(before.sponsorshipStatus).toBe("possible");

    const { detail } = await scan(ownerId, routes);
    expect(detail.newCount).toBe(0);
    expect(generate).toHaveBeenCalledTimes(1);
    const after = await m.listings.getListing(ownerId, before.id);
    expect(after.id).toBe(before.id);
    expect(after.status).toBe("applied");
    expect(after.location).toBe("Amsterdam (Hybrid), Netherlands");
    expect(after.workArrangement).toBe("hybrid");
    expect(after.sponsorshipStatus).toBe("confirmed");
    expect(after.matchScore).not.toBeNull();
    expect(after.events.map((event) => event.type)).toContain("content_updated");
  });

  it("recognises the same job arriving from another source", async () => {
    // Arbeitnow is down, so the Nordlicht job now arrives only from the company's Ashby board.
    const routes = [{ match: "arbeitnow.com", status: 500, body: "down" }, ...ALL_SOURCES_OK];
    const before = await m.prisma.jobListing.count({ where: { ownerId } });
    await scan(ownerId, routes);
    expect(await m.prisma.jobListing.count({ where: { ownerId } })).toBe(before);
    const listing = await byTitle(ownerId, "Senior Frontend Engineer (m/f/d)");
    expect(listing.sourceId).toBe("arbeitnow");
    expect(listing.alsoSeenOn).toEqual([
      { sourceId: "ashby", url: "https://jobs.ashbyhq.com/nordlicht/a1b2c3d4-0000-4000-8000-000000000001" },
    ]);
  });
});

describe("source failures (scenario 8)", () => {
  it("keeps the results of the sources that worked when one source fails", async () => {
    const fresh = await setUpOwner("scanner-partial@example.com");
    const routes = [{ match: "boards-api.greenhouse.io", status: 503, body: "unavailable" }, ...ALL_SOURCES_OK];
    const { detail } = await scan(fresh, routes);
    expect(detail.status).toBe("partial");
    expect(detail.errorSummary).toMatch(/greenhouse/);
    const greenhouse = detail.sourceResults.find((result) => result.sourceId === "greenhouse");
    expect(greenhouse).toMatchObject({ status: "failed", fetchedCount: 0 });
    expect(greenhouse?.error).toMatch(/All 1 company boards failed/);
    // Three attempts: the first and two retries.
    expect(greenhouse?.requestCount).toBe(3);
    expect(
      detail.sourceResults.filter((result) => result.status === "completed").map((result) => result.sourceId),
    ).toEqual(["arbeitnow", "ashby", "remotive"]);
    expect(detail.newCount).toBe(4);
    const { listings } = await m.listings.listListings(fresh, { status: "all" });
    expect(listings.map((listing) => listing.sourceId).sort()).toEqual(["arbeitnow", "arbeitnow", "ashby", "remotive"]);
    expect(listings.every((listing) => listing.matchScore !== null)).toBe(true);
  });

  it("records a malformed response as that source's failure only", async () => {
    const fresh = await setUpOwner("scanner-malformed@example.com");
    const routes = [{ match: "arbeitnow.com", body: { data: "not-a-list" } }, ...ALL_SOURCES_OK];
    const { detail } = await scan(fresh, routes);
    expect(detail.status).toBe("partial");
    const arbeitnow = detail.sourceResults.find((result) => result.sourceId === "arbeitnow");
    expect(arbeitnow).toMatchObject({ status: "failed", error: "The source returned data in an unexpected shape." });
    expect(detail.newCount).toBeGreaterThan(0);
  });

  it("fails the scan only when every source failed, and keeps earlier listings", async () => {
    const fresh = await setUpOwner("scanner-allfail@example.com");
    await scan(fresh);
    const before = await m.prisma.jobListing.count({ where: { ownerId: fresh } });
    // Remotive is skipped (read recently); every source that ran failed.
    const { detail } = await scan(fresh, [{ match: /.*/, status: 500, body: "down" }]);
    expect(detail.status).toBe("failed");
    expect(detail.newCount).toBe(0);
    expect(await m.prisma.jobListing.count({ where: { ownerId: fresh } })).toBe(before);
    // The lock is released: the next scan can start.
    const next = await scan(fresh);
    expect(next.detail.status).toBe("completed");
  });

  it("reports a scan with no enabled source instead of running empty", async () => {
    const fresh = await setUpOwner("scanner-nosource@example.com");
    const { detail } = await scan(fresh, ALL_SOURCES_OK, "manual", []);
    expect(detail.status).toBe("failed");
    expect(detail.errorSummary).toMatch(/No job source is enabled/);
  });
});

describe("AI matching failures and cost controls", () => {
  it("still discovers and classifies jobs when the AI provider fails, and says so", async () => {
    const fresh = await setUpOwner("scanner-aifail@example.com");
    const provider = m.ai.getProvider("mock");
    const failing = vi
      .spyOn(provider, "generateStructured")
      .mockRejectedValue(
        new m.aiTypes.AIProviderError("mock", "rate_limit", "The provider is rate limiting requests.", true),
      );
    const { detail } = await scan(fresh);
    failing.mockRestore();
    expect(detail.status).toBe("partial");
    expect(detail.newCount).toBe(5);
    expect(detail.analyzedCount).toBe(0);
    expect(detail.errorSummary).toMatch(/AI analysis stopped: The provider is rate limiting requests/);
    const { listings } = await m.listings.listListings(fresh, { status: "all" });
    expect(listings).toHaveLength(5);
    expect(listings.every((listing) => listing.matchScore === null)).toBe(true);
    expect(listings.find((listing) => listing.title === "Senior Frontend Engineer (m/f/d)")?.sponsorshipStatus).toBe(
      "confirmed",
    );
    // Stopped after three failures in a row (each tried twice): not once per listing.
    expect(listings.filter((listing) => listing.analysisStatus === "failed").length).toBeLessThanOrEqual(4);

    // The next scan analyses what is still waiting, without creating listings.
    const retry = await scan(fresh);
    expect(retry.detail.newCount).toBe(0);
    expect(retry.detail.analyzedCount).toBe(5);
    const scored = await m.listings.listListings(fresh, { status: "all" });
    expect(scored.listings.every((listing) => listing.matchScore !== null)).toBe(true);
  });

  it("says clearly when no AI provider is configured and never switches provider", async () => {
    const fresh = await setUpOwner("scanner-noprovider@example.com");
    await m.prisma.aIProviderConfiguration.deleteMany({ where: { ownerId: fresh } });
    const provider = m.ai.getProvider("mock");
    using generate = vi.spyOn(provider, "generateStructured");
    const { detail } = await scan(fresh);
    expect(detail.status).toBe("partial");
    expect(detail.newCount).toBe(5);
    expect(detail.errorSummary).toMatch(/AI matching is unavailable: No AI provider is configured/);
    expect(generate).not.toHaveBeenCalled();
  });

  it("limits AI analyses per scan and prioritises confirmed sponsorship", async () => {
    const fresh = await setUpOwner("scanner-limit@example.com");
    await m.preferences.saveJobSearchPreferences(fresh, { ...PREFERENCES, maxAnalysesPerScan: 2 });
    const { detail } = await scan(fresh);
    expect(detail.newCount).toBe(5);
    expect(detail.analyzedCount).toBe(2);
    const { listings } = await m.listings.listListings(fresh, { status: "all" });
    const scored = listings.filter((listing) => listing.matchScore !== null);
    expect(scored).toHaveLength(2);
    expect(scored.map((listing) => listing.sponsorshipStatus)).toContain("confirmed");
    expect(scored.map((listing) => listing.sponsorshipStatus)).not.toContain("unknown");
  });

  it("skips AI entirely when matching is turned off", async () => {
    const fresh = await setUpOwner("scanner-aioff@example.com");
    await m.preferences.saveJobSearchPreferences(fresh, { ...PREFERENCES, aiMatchingEnabled: false });
    const provider = m.ai.getProvider("mock");
    using generate = vi.spyOn(provider, "generateStructured");
    const { detail } = await scan(fresh);
    expect(detail.status).toBe("completed");
    expect(detail.newCount).toBe(5);
    expect(generate).not.toHaveBeenCalled();
    expect(detail.errorSummary).toMatch(/AI matching is turned off/);
  });

  it("discovers jobs without a confirmed profile but does not score them", async () => {
    const user = await m.prisma.user.create({ data: { email: "scanner-noprofile@example.com", passwordHash: "x" } });
    await m.settings.saveProviderSetting(user.id, {
      providerId: "mock",
      modelId: "mock-deterministic-v1",
      makeDefault: true,
    });
    await m.preferences.saveJobSearchPreferences(user.id, PREFERENCES);
    const provider = m.ai.getProvider("mock");
    using generate = vi.spyOn(provider, "generateStructured");
    const { detail } = await scan(user.id);
    expect(detail.newCount).toBe(5);
    expect(detail.errorSummary).toMatch(/Confirm your Master Career Profile/);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rescores from the stored requirements when the rubric or the profile changes, without AI", async () => {
    const listing = await byTitle(ownerId, "React Developer");
    const provider = m.ai.getProvider("mock");
    using generate = vi.spyOn(provider, "generateStructured");
    const preferences = await m.preferences.getJobSearchPreferences(ownerId);
    const titleOnly = {
      ...preferences.rubric,
      weights: { mandatory: 0, skills: 0, preferred: 0, title: 100, seniority: 0 },
    };
    const context = await m.analysis.loadMatchContext(ownerId, titleOnly);
    expect(await m.analysis.refreshStaleMatches(ownerId, context)).toBeGreaterThan(0);
    const rescored = await m.listings.getListing(ownerId, listing.id);
    expect(rescored.breakdown?.components.find((component) => component.id === "mandatory")?.points).toBe(0);
    // Nothing is stale now.
    expect(await m.analysis.refreshStaleMatches(ownerId, context)).toBe(0);

    // A new profile revision without React lowers the score of a React job.
    const profile = sampleProfile();
    await m.profile.saveProfileRevision(
      ownerId,
      {
        ...profile,
        skills: profile.skills.filter((skill) => skill.name !== "React"),
        projects: profile.projects.map((project) => ({
          ...project,
          technologies: project.technologies.filter((technology) => technology !== "React"),
        })),
        experience: profile.experience.map((entry) => ({
          ...entry,
          technologies: entry.technologies.filter((technology) => technology !== "React"),
        })),
      },
      { confirmed: true },
    );
    const defaults = await m.analysis.loadMatchContext(ownerId, preferences.rubric);
    await m.analysis.refreshStaleMatches(ownerId, defaults);
    const withoutReact = await m.listings.getListing(ownerId, listing.id);
    expect(withoutReact.matchingSkills).not.toContain("react");
    await m.profile.saveProfileRevision(ownerId, sampleProfile(), { confirmed: true });
    await m.analysis.refreshStaleMatches(ownerId, await m.analysis.loadMatchContext(ownerId, preferences.rubric));
    const restored = await m.listings.getListing(ownerId, listing.id);
    expect(restored.matchingSkills).toContain("react");
    expect(restored.matchScore).toBeGreaterThan(withoutReact.matchScore ?? 100);
    expect(generate).not.toHaveBeenCalled();
  });

  it("does not count unconfirmed profile entries as qualifications", async () => {
    // The fixture profile lists Kubernetes as imported, not confirmed.
    const imported = await m.listings.importJobPosting(ownerId, {
      url: "https://careers.example.org/jobs/platform-1",
      title: "Frontend Engineer",
      company: "Helm Harbor",
      location: "Hamburg, Germany",
      description: "We need a frontend engineer.\nRequirements:\n- Required: Kubernetes\n- Required: Docker\n",
    });
    const preferences = await m.preferences.getJobSearchPreferences(ownerId);
    await m.analysis.analyzeListingNow(ownerId, imported.listingId, preferences.rubric);
    const detail = await m.listings.getListing(ownerId, imported.listingId);
    expect(detail.matchingSkills).not.toContain("kubernetes");
    expect(detail.missingQualifications.map((item) => item.description).join(" ")).toMatch(/kubernetes/i);
  });
});

describe("job tracking", () => {
  it("moves a listing through every status and keeps the history", async () => {
    const listing = await byTitle(ownerId, "Frontend Tech Lead");
    for (const status of ["saved", "applied", "interviewing", "rejected", "offer", "dismissed", "new"]) {
      expect(await m.listings.setListingStatus(ownerId, listing.id, status)).toBe(status);
    }
    await m.listings.setListingStatus(ownerId, listing.id, "saved");
    const detail = await m.listings.getListing(ownerId, listing.id);
    expect(detail.status).toBe("saved");
    const changes = detail.events.filter((event) => event.type === "status_changed");
    expect(changes).toHaveLength(8);
    expect(changes[0]).toMatchObject({ fromStatus: "new", toStatus: "saved" });
    await expect(m.listings.setListingStatus(ownerId, listing.id, "hired")).rejects.toThrow(/Unknown job status/);
  });

  it("hides dismissed and rejected listings from the default view but keeps them", async () => {
    const listing = await byTitle(ownerId, "React Developer");
    await m.listings.setListingStatus(ownerId, listing.id, "dismissed");
    const active = await m.listings.listListings(ownerId);
    expect(active.listings.map((item) => item.id)).not.toContain(listing.id);
    const dismissed = await m.listings.listListings(ownerId, { status: "dismissed" });
    expect(dismissed.listings.map((item) => item.id)).toEqual([listing.id]);
    // A later scan does not bring it back as new.
    await scan(ownerId);
    expect((await m.listings.getListing(ownerId, listing.id)).status).toBe("dismissed");
    await m.listings.setListingStatus(ownerId, listing.id, "new");
  });
});

describe("importing a posting (LinkedIn and other sites that cannot be scanned)", () => {
  const posting = {
    url: "https://www.linkedin.com/jobs/view/senior-frontend-engineer-at-polder-labs-3912345678/?trk=public_jobs&refId=abc",
    title: "Senior Frontend Engineer",
    company: "Polder Labs",
    location: "Utrecht, Netherlands",
    description:
      "Polder Labs is hiring a Senior Frontend Engineer.\nRequirements: 5+ years of React and TypeScript.\nWe sponsor work permits for international hires and offer a relocation package.",
  };

  it("stores the posting as imported from LinkedIn without fetching anything", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await m.listings.importJobPosting(ownerId, posting);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(result.created).toBe(true);
    const detail = await m.listings.getListing(ownerId, result.listingId);
    expect(detail).toMatchObject({
      sourceId: "linkedin",
      ingestion: "manual",
      countryCode: "NL",
      sponsorshipStatus: "confirmed",
      relocationStatus: "offered",
      status: "new",
    });
    expect(detail.url).toBe(
      "https://www.linkedin.com/jobs/view/senior-frontend-engineer-at-polder-labs-3912345678/?refId=abc",
    );
    expect(detail.events.map((event) => event.type)).toEqual(expect.arrayContaining(["discovered", "imported"]));
    const row = await m.prisma.jobListing.findUniqueOrThrow({ where: { id: result.listingId } });
    expect(row.externalId).toBe("3912345678");
  });

  it("does not duplicate a posting imported twice", async () => {
    const again = await m.listings.importJobPosting(ownerId, {
      ...posting,
      url: "https://www.linkedin.com/jobs/view/3912345678",
    });
    expect(again.created).toBe(false);
    expect(await m.prisma.jobListing.count({ where: { ownerId, sourceId: "linkedin" } })).toBe(1);
  });

  it("rejects links that are not plain web addresses and postings without text", async () => {
    const attempt = (patch: Record<string, unknown>) => m.listings.importJobPosting(ownerId, { ...posting, ...patch });
    await expect(attempt({ url: "javascript:alert(1)" })).rejects.toThrow(/full link/);
    await expect(attempt({ url: "http://localhost:3000/admin" })).rejects.toThrow(/full link/);
    await expect(attempt({ description: "too short" })).rejects.toThrow(/at least 50 characters/);
    await expect(attempt({ title: "" })).rejects.toThrow(/job title/);
  });
});

describe("resume tailoring integration (scenario 7)", () => {
  it("hands the listing to the existing tailoring pipeline and links the resume to the job", async () => {
    const listing = await byTitle(ownerId, "Senior Frontend Engineer (m/f/d)");
    const provider = m.ai.getProvider("mock");
    using generate = vi.spyOn(provider, "generateStructured");

    const { jobDescriptionId } = await m.listings.prepareTailoring(ownerId, listing.id);
    const job = await m.jobs.getJobDescription(ownerId, jobDescriptionId);
    const detail = await m.listings.getListing(ownerId, listing.id);
    expect(job).toMatchObject({
      title: "Senior Frontend Engineer (m/f/d)",
      company: "Nordlicht Software GmbH",
      location: "Berlin",
      sourceUrl: listing.url,
      originalText: detail.description,
    });
    // The requirements the scanner extracted are reused; nothing is analysed twice.
    expect(job.analysis?.requirements.length).toBeGreaterThan(0);
    expect(job.analysisProviderId).toBe("mock");

    // Opening the workflow again uses the same job description.
    expect((await m.listings.prepareTailoring(ownerId, listing.id)).jobDescriptionId).toBe(jobDescriptionId);
    expect(await m.prisma.jobDescription.count({ where: { ownerId, sourceUrl: listing.url } })).toBe(1);

    const quick = await m.tailoring.generateResume(ownerId, { jobDescriptionId, mode: "quick" });
    expect(quick.kind).toBe("quick");
    const tasks = generate.mock.calls.map(([request]) => request.task);
    expect(tasks).toEqual(["resume_tailoring"]);

    const review = await m.tailoring.generateResume(ownerId, { jobDescriptionId, mode: "review" });
    expect(review.kind).toBe("review");

    const linked = await m.listings.getListing(ownerId, listing.id);
    expect(linked.jobDescriptionId).toBe(jobDescriptionId);
    expect(linked.resumes).toHaveLength(1);
    if (quick.kind === "quick") expect(linked.resumes[0].id).toBe(quick.resumeId);
    expect(linked.events.map((event) => event.type)).toContain("tailoring_started");
    expect(linked.status).toBe(listing.status);
  });

  it("keeps the listing when its job description is deleted", async () => {
    const listing = await byTitle(ownerId, "Frontend Tech Lead");
    const { jobDescriptionId } = await m.listings.prepareTailoring(ownerId, listing.id);
    await m.jobs.deleteJobDescription(ownerId, jobDescriptionId);
    const detail = await m.listings.getListing(ownerId, listing.id);
    expect(detail.jobDescriptionId).toBeNull();
    const again = await m.listings.prepareTailoring(ownerId, listing.id);
    expect(again.jobDescriptionId).not.toBe(jobDescriptionId);
  });
});

describe("scheduled scans (scenario 2)", () => {
  const enable = async (owner: string, slot: Date) => {
    await m.preferences.saveJobSearchPreferences(owner, { ...PREFERENCES, scheduleEnabled: true });
    await m.prisma.jobSearchPreferences.update({ where: { ownerId: owner }, data: { nextRunAt: slot } });
  };

  it("starts the due scan once, however often and from wherever the trigger fires", async () => {
    const owner = await setUpOwner("scanner-scheduled@example.com");
    const slot = new Date("2027-03-01T04:00:00Z");
    const now = new Date("2027-03-01T04:00:30Z");
    await enable(owner, slot);

    // Two triggers at the same moment (cron and the in-process check, or two servers).
    const [first, second] = await Promise.all([m.scheduler.claimDueScans(now), m.scheduler.claimDueScans(now)]);
    const started = [...first.started, ...second.started].filter((item) => item.ownerId === owner);
    expect(started).toHaveLength(1);
    expect(started[0].scheduledFor).toBe(slot.toISOString());

    const { fetchImpl } = mockFetch(ALL_SOURCES_OK);
    await m.scans.executeScan(started[0].scanId, {
      fetchImpl,
      sleep: noSleep,
      sources: sourceSettings(),
      aiRetryDelayMs: 0,
    });
    const detail = await m.scans.getScanDetail(owner, started[0].scanId);
    expect(detail).toMatchObject({ trigger: "scheduled", status: "completed", newCount: 5 });
    expect(detail.scheduledFor?.toISOString()).toBe(slot.toISOString());

    // The schedule moved on to the next day at the same local time.
    const preferences = await m.preferences.getJobSearchPreferences(owner);
    expect(preferences.nextRunAt?.toISOString()).toBe("2027-03-02T04:00:00.000Z");
    const again = await m.scheduler.claimDueScans(new Date("2027-03-01T04:05:00Z"));
    expect(again.started.filter((item) => item.ownerId === owner)).toEqual([]);
    expect(await m.prisma.jobScan.count({ where: { ownerId: owner, trigger: "scheduled" } })).toBe(1);
  });

  it("does nothing before the scheduled time or when the schedule is off", async () => {
    const owner = await setUpOwner("scanner-notdue@example.com");
    await enable(owner, new Date("2027-03-01T04:00:00Z"));
    const early = await m.scheduler.claimDueScans(new Date("2027-03-01T03:59:00Z"));
    expect(early.started.filter((item) => item.ownerId === owner)).toEqual([]);
    await m.preferences.saveJobSearchPreferences(owner, PREFERENCES);
    const off = await m.scheduler.claimDueScans(new Date("2027-03-01T05:00:00Z"));
    expect(off.started.filter((item) => item.ownerId === owner)).toEqual([]);
    expect(await m.prisma.jobScan.count({ where: { ownerId: owner } })).toBe(0);
  });

  it("makes up a run missed while the server was down, once", async () => {
    const owner = await setUpOwner("scanner-late@example.com");
    await enable(owner, new Date("2027-03-01T04:00:00Z"));
    const late = await m.scheduler.claimDueScans(new Date("2027-03-01T09:30:00Z"));
    const started = late.started.filter((item) => item.ownerId === owner);
    expect(started).toHaveLength(1);
    await m.prisma.jobScan.update({
      where: { id: started[0].scanId },
      data: { status: "completed", activeLock: null, finishedAt: new Date() },
    });
    const preferences = await m.preferences.getJobSearchPreferences(owner);
    expect(preferences.nextRunAt?.toISOString()).toBe("2027-03-02T04:00:00.000Z");
  });

  it("skips a run missed by more than twelve hours and records it in the history", async () => {
    const owner = await setUpOwner("scanner-missed@example.com");
    await enable(owner, new Date("2027-03-01T04:00:00Z"));
    const result = await m.scheduler.claimDueScans(new Date("2027-03-03T10:00:00Z"));
    expect(result.started.filter((item) => item.ownerId === owner)).toEqual([]);
    expect(result.skipped.find((item) => item.ownerId === owner)?.reason).toMatch(/missed by more than 12 hours/);
    const history = await m.scans.listScans(owner);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ status: "skipped", trigger: "scheduled" });
    // One catch-up decision, not one per missed day; the schedule resumes at its next time.
    const preferences = await m.preferences.getJobSearchPreferences(owner);
    expect(preferences.nextRunAt?.toISOString()).toBe("2027-03-04T04:00:00.000Z");
  });

  it("does not overlap a scan that is already running", async () => {
    const owner = await setUpOwner("scanner-overlap@example.com");
    const manual = await m.scans.startScan(owner, "manual");
    await enable(owner, new Date("2027-03-01T04:00:00Z"));
    const result = await m.scheduler.claimDueScans(new Date("2027-03-01T04:00:10Z"));
    expect(result.started.filter((item) => item.ownerId === owner)).toEqual([]);
    expect(result.skipped.find((item) => item.ownerId === owner)?.reason).toMatch(/already running/);
    expect(await m.prisma.jobScan.count({ where: { ownerId: owner, status: "running" } })).toBe(1);
    await m.prisma.jobScan.update({
      where: { id: manual.scanId },
      data: { status: "failed", activeLock: null, finishedAt: new Date() },
    });
  });

  it("runs due scans to completion from a single call", async () => {
    const owner = await setUpOwner("scanner-rundue@example.com");
    await enable(owner, new Date("2027-03-01T04:00:00Z"));
    const { fetchImpl } = mockFetch(ALL_SOURCES_OK);
    const result = await m.scheduler.runDueScans(new Date("2027-03-01T04:01:00Z"), {
      fetchImpl,
      sleep: noSleep,
      sources: sourceSettings(),
      aiRetryDelayMs: 0,
    });
    const mine = result.started.filter((item) => item.ownerId === owner);
    expect(mine).toHaveLength(1);
    expect((await m.scans.getScan(owner, mine[0].scanId)).status).toBe("completed");
  });
});

describe("scheduled scan endpoint", () => {
  const call = async (headers: Record<string, string>, method = "POST") => {
    const route = await import("@/app/api/cron/job-scan/route");
    const request = new NextRequest("http://localhost/api/cron/job-scan?wait=1", { method, headers });
    return method === "GET" ? route.GET(request) : route.POST(request);
  };

  it("rejects requests without the secret", async () => {
    expect((await call({})).status).toBe(401);
    expect((await call({ authorization: "Bearer wrong-secret-wrong-secret-wrong" })).status).toBe(401);
    expect((await call({ authorization: `Basic ${CRON_SECRET}` })).status).toBe(401);
    expect((await call({ authorization: `Bearer ${CRON_SECRET}x` })).status).toBe(401);
    expect((await call({ cookie: "cverixa_session=anything" })).status).toBe(401);
  });

  it("accepts the bearer secret and reports what it started", async () => {
    const response = await call({ authorization: `Bearer ${CRON_SECRET}` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ started: [], skipped: [] });
    expect((await call({ authorization: `Bearer ${CRON_SECRET}` }, "GET")).status).toBe(200);
  });
});

describe("scan history", () => {
  it("lists every run with its trigger, counts, sources and errors", async () => {
    const history = await m.scans.listScans(ownerId, 50);
    expect(history.length).toBeGreaterThanOrEqual(5);
    expect(history[0].startedAt.getTime()).toBeGreaterThanOrEqual(history[history.length - 1].startedAt.getTime());
    const completed = history.filter((scan) => scan.status === "completed");
    expect(completed.length).toBeGreaterThan(0);
    for (const run of completed) {
      expect(run.id).toMatch(/^c[a-z0-9]+$/);
      expect(run.trigger).toBe("manual");
      expect(run.finishedAt).not.toBeNull();
      expect(run.sources).toEqual(["arbeitnow", "greenhouse", "ashby", "remotive"]);
      expect(run.countries).toEqual(["DE", "NL", "AT"]);
    }
    const partial = history.find((run) => run.status === "partial");
    expect(partial?.errorSummary).toMatch(/arbeitnow/);
    const detail = await m.scans.getScanDetail(ownerId, completed[0].id);
    expect(detail.sourceResults.map((result) => result.sourceId)).toEqual([
      "arbeitnow",
      "greenhouse",
      "ashby",
      "remotive",
    ]);
    expect(detail.sourceResults[0].durationMs).toBeGreaterThanOrEqual(0);
    const state = await m.scans.getScanState(ownerId);
    expect(state.running).toBeNull();
    expect(state.last?.id).toBe(history.find((run) => run.status !== "skipped")?.id);
  });
});

describe("ownership boundaries", () => {
  it("keeps one owner's listings, scans and preferences from another", async () => {
    const listing = await byTitle(ownerId, "Staff Frontend Engineer");
    const scanId = (await m.scans.listScans(ownerId))[0].id;
    expect((await m.listings.listListings(otherId, { status: "all" })).total).toBe(0);
    await expect(m.listings.getListing(otherId, listing.id)).rejects.toThrow(/not found/i);
    await expect(m.listings.setListingStatus(otherId, listing.id, "applied")).rejects.toThrow(/not found/i);
    await expect(m.listings.prepareTailoring(otherId, listing.id)).rejects.toThrow(/not found/i);
    await expect(m.scans.getScan(otherId, scanId)).rejects.toThrow(/not found/i);
    await expect(m.scans.getScanDetail(otherId, scanId)).rejects.toThrow(/not found/i);
    const preferences = await m.preferences.getJobSearchPreferences(ownerId);
    await expect(m.analysis.analyzeListingNow(otherId, listing.id, preferences.rubric)).rejects.toThrow(/not found/i);
    expect((await m.listings.getListing(ownerId, listing.id)).status).toBe("applied");
    const theirScans = await m.scans.listScans(otherId);
    expect(theirScans.map((item) => item.id)).not.toContain(scanId);
    expect(theirScans.every((item) => item.newCount === 0)).toBe(true);
  });

  it("gives each owner their own copy of a job found by both", async () => {
    await scan(otherId);
    const mine = await byTitle(ownerId, "Staff Frontend Engineer");
    const theirs = await byTitle(otherId, "Staff Frontend Engineer");
    expect(theirs.id).not.toBe(mine.id);
    expect(theirs.status).toBe("new");
    expect(mine.status).toBe("applied");
  });

  it("removes a user's scanner data with the user", async () => {
    const user = await setUpOwner("scanner-delete@example.com");
    await scan(user);
    expect(await m.prisma.jobListing.count({ where: { ownerId: user } })).toBeGreaterThan(0);
    await m.prisma.user.delete({ where: { id: user } });
    expect(await m.prisma.jobListing.count({ where: { ownerId: user } })).toBe(0);
    expect(await m.prisma.jobScan.count({ where: { ownerId: user } })).toBe(0);
    expect(await m.prisma.jobSearchPreferences.count({ where: { ownerId: user } })).toBe(0);
  });
});
