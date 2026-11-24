import { describe, expect, it } from "vitest";
import { arbeitnowSource } from "@/features/job-scanner/sources/arbeitnow";
import { ashbySource } from "@/features/job-scanner/sources/ashby";
import { formatBoards, parseBoards } from "@/features/job-scanner/sources/boards";
import { euresSource, indeedSource, linkedinSource } from "@/features/job-scanner/sources/external-links";
import { greenhouseSource } from "@/features/job-scanner/sources/greenhouse";
import { createSourceHttp, SourceRequestError, sourceErrorMessage } from "@/features/job-scanner/sources/http";
import { leverSource } from "@/features/job-scanner/sources/lever";
import {
  AUTOMATIC_SOURCES,
  JOB_SOURCES,
  LINK_ONLY_SOURCES,
  sourceIdForHost,
  sourceLabel,
} from "@/features/job-scanner/sources/registry";
import { remotiveSource } from "@/features/job-scanner/sources/remotive";
import type { AutomaticSource, SourceQuery } from "@/features/job-scanner/sources/types";
import {
  ALL_SOURCES_OK,
  ARBEITNOW_PAGE,
  ASHBY_BOARD,
  GREENHOUSE_BOARD,
  mockFetch,
  REMOTIVE_FEED,
} from "../fixtures/job-sources";

const query: SourceQuery = { keywords: ["Frontend Engineer"], countries: ["DE"], workArrangements: [] };
const noSleep = async () => undefined;

function run<Config>(source: AutomaticSource<Config>, config: Config, routes = ALL_SOURCES_OK) {
  const { fetchImpl, calls } = mockFetch(routes);
  const http = createSourceHttp({
    allowedHosts: source.allowedHosts,
    maxRequests: source.limits.maxRequestsPerScan,
    timeoutMs: 5_000,
    fetchImpl,
    sleep: noSleep,
  });
  return source.fetchJobs(query, config, { http }).then((result) => ({ ...result, calls, http }));
}

describe("source registry", () => {
  it("gives every source a unique id and a consistent contract", () => {
    const ids = JOB_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const source of AUTOMATIC_SOURCES) {
      expect(source.allowedHosts.length).toBeGreaterThan(0);
      expect(source.limits.maxRequestsPerScan).toBeGreaterThan(0);
      expect(source.attribution.length).toBeGreaterThan(0);
      expect(source.configSchema.safeParse(source.defaultConfig).success).toBe(true);
    }
  });

  it("includes LinkedIn as a link-only source and says why it is not scanned", () => {
    expect(LINK_ONLY_SOURCES.map((source) => source.id)).toContain("linkedin");
    expect(AUTOMATIC_SOURCES.map((source) => source.id)).not.toContain("linkedin");
    expect(linkedinSource.limitation).toMatch(/does not read LinkedIn/);
    expect(linkedinSource.searchUrl("Frontend Engineer", { code: "DE", name: "Germany" })).toBe(
      "https://www.linkedin.com/jobs/search/?keywords=Frontend+Engineer&location=Germany",
    );
  });

  it("builds search links for the other link-only sites", () => {
    expect(indeedSource.searchUrl("React Developer", { code: "NL", name: "Netherlands" })).toBe(
      "https://nl.indeed.com/jobs?q=React+Developer",
    );
    expect(euresSource.searchUrl("React Developer", { code: "DE", name: "Germany" })).toContain("locationCodes=de");
    expect(euresSource.searchUrl("React Developer", { code: "CA", name: "Canada" })).toBeNull();
  });

  it("labels sources and maps import hosts", () => {
    expect(sourceLabel("greenhouse")).toBe("Greenhouse boards");
    expect(sourceLabel("manual")).toBe("Imported");
    expect(sourceIdForHost("www.linkedin.com")).toBe("linkedin");
    expect(sourceIdForHost("de.indeed.com")).toBe("indeed");
    expect(sourceIdForHost("careers.example.com")).toBe("manual");
    expect(sourceIdForHost("notlinkedin.com")).toBe("manual");
  });

  it("marks Lever as unverified and off until boards are added", () => {
    expect(leverSource.verified).toBe(false);
    expect(leverSource.enabledByDefault).toBe(false);
    expect(leverSource.unavailableReason(query, leverSource.defaultConfig)).toMatch(/No company boards/);
  });
});

describe("guarded source requests", () => {
  const http = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createSourceHttp>[0]> = {}) =>
    createSourceHttp({
      allowedHosts: ["api.example.com"],
      maxRequests: 3,
      timeoutMs: 1_000,
      fetchImpl,
      sleep: noSleep,
      ...extra,
    });

  it("refuses hosts outside the allow-list, other schemes and ports (no SSRF)", async () => {
    const { fetchImpl, calls } = mockFetch([{ match: /.*/, body: {} }]);
    const client = http(fetchImpl);
    for (const url of [
      "https://evil.example.org/data",
      "https://api.example.com.evil.org/data",
      "http://api.example.com/data",
      "https://api.example.com:8443/data",
      "https://user:pass@api.example.com/data",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost:5432/",
      "file:///etc/passwd",
    ]) {
      await expect(client.getJson(url)).rejects.toBeInstanceOf(SourceRequestError);
    }
    expect(calls).toEqual([]);
  });

  it("does not follow redirects", async () => {
    const { fetchImpl } = mockFetch([
      { match: "api.example.com", status: 302, headers: { location: "http://169.254.169.254/" }, body: "" },
    ]);
    await expect(http(fetchImpl).getJson("https://api.example.com/jobs")).rejects.toThrow(/redirect/);
  });

  it("retries transient failures with backoff and then succeeds", async () => {
    let attempts = 0;
    const waits: number[] = [];
    const fetchImpl = (async () => {
      attempts += 1;
      if (attempts < 3) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const client = http(fetchImpl, { sleep: async (ms) => void waits.push(ms) });
    await expect(client.getJson("https://api.example.com/jobs")).resolves.toEqual({ ok: true });
    expect(attempts).toBe(3);
    expect(waits).toEqual([500, 1500]);
    expect(client.requestCount).toBe(3);
  });

  it("honours Retry-After on rate limits and gives up after the retries", async () => {
    const waits: number[] = [];
    const fetchImpl = (async () =>
      new Response("slow down", { status: 429, headers: { "retry-after": "2" } })) as typeof fetch;
    const client = http(fetchImpl, { sleep: async (ms) => void waits.push(ms) });
    await expect(client.getJson("https://api.example.com/jobs")).rejects.toThrow(/rate limiting/);
    expect(waits).toEqual([2000, 2000]);
  });

  it("does not retry a missing board and reports it plainly", async () => {
    const { fetchImpl, calls } = mockFetch([]);
    await expect(http(fetchImpl).getJson("https://api.example.com/jobs")).rejects.toThrow(/404/);
    expect(calls).toHaveLength(1);
  });

  it("stops at the per-scan request limit", async () => {
    const { fetchImpl } = mockFetch([{ match: "api.example.com", body: {} }]);
    const client = http(fetchImpl, { maxRequests: 2 });
    await client.getJson("https://api.example.com/1");
    await client.getJson("https://api.example.com/2");
    await expect(client.getJson("https://api.example.com/3")).rejects.toThrow(/request limit/);
  });

  it("rejects oversized and non-JSON responses", async () => {
    const big = mockFetch([{ match: "api.example.com", body: "x".repeat(2000) }]);
    await expect(http(big.fetchImpl, { maxResponseBytes: 1000 }).getJson("https://api.example.com/")).rejects.toThrow(
      /larger than the allowed size/,
    );
    const html = mockFetch([{ match: "api.example.com", body: "<html>blocked</html>" }]);
    await expect(http(html.fetchImpl).getJson("https://api.example.com/")).rejects.toThrow(/valid JSON/);
  });

  it("turns network failures into a safe message", async () => {
    const { fetchImpl } = mockFetch([{ match: "api.example.com", fail: true }]);
    const error = await http(fetchImpl, { retries: 0 })
      .getJson("https://api.example.com/")
      .catch((caught: unknown) => caught);
    expect(sourceErrorMessage(error)).toBe("The source could not be reached.");
    expect(sourceErrorMessage(new Error("secret internals"))).toBe("The source failed unexpectedly.");
  });
});

describe("company board configuration", () => {
  it("parses slugs and names and drops anything that is not a safe slug", () => {
    const boards = parseBoards(
      "adyen\nsumup | SumUp\n../../etc/passwd\nhttps://evil.example/x\nsome board\nadyen\n?x=1\n",
    );
    expect(boards).toEqual([
      { slug: "adyen", name: "Adyen" },
      { slug: "sumup", name: "SumUp" },
    ]);
    expect(formatBoards(boards)).toBe("adyen\nsumup | SumUp");
  });
});

describe("Arbeitnow adapter", () => {
  it("normalises postings and requests the visa-sponsorship filter", async () => {
    const result = await run(arbeitnowSource, { visaSponsorshipOnly: true, maxPages: 2 });
    expect(result.calls.map((call) => call.url)).toEqual([
      "https://www.arbeitnow.com/api/job-board-api?visa_sponsorship=true&page=1",
    ]);
    expect(result.jobs).toHaveLength(ARBEITNOW_PAGE.data.length);
    expect(result.jobs[0]).toMatchObject({
      externalId: "senior-frontend-engineer-berlin-1001",
      company: "Nordlicht Software GmbH",
      location: "Berlin",
      sponsorshipFlag: true,
    });
    expect(result.jobs[0].postedAt?.toISOString()).toBe(new Date(1795470325 * 1000).toISOString());
  });

  it("does not set the board's sponsorship flag when the filter is off", async () => {
    const result = await run(arbeitnowSource, { visaSponsorshipOnly: false, maxPages: 1 });
    expect(result.calls[0].url).not.toContain("visa_sponsorship");
    expect(result.jobs.every((job) => job.sponsorshipFlag === false)).toBe(true);
  });
});

describe("Greenhouse adapter", () => {
  const config = { boards: [{ slug: "kanaal", name: "Kanaal" }] };

  it("reads a company board", async () => {
    const result = await run(greenhouseSource, config);
    expect(result.calls[0].url).toBe("https://boards-api.greenhouse.io/v1/boards/kanaal/jobs?content=true");
    expect(result.jobs).toHaveLength(GREENHOUSE_BOARD.jobs.length);
    expect(result.jobs[0]).toMatchObject({
      externalId: "kanaal:7001",
      title: "Staff Frontend Engineer",
      company: "Kanaal",
      location: "Amsterdam, Netherlands",
    });
    expect(result.jobs[0].descriptionHtml).toContain("&lt;p&gt;");
  });

  it("keeps the boards that work when one board fails", async () => {
    const result = await run(greenhouseSource, {
      boards: [
        { slug: "gone", name: "Gone Inc" },
        { slug: "kanaal", name: "Kanaal" },
      ],
    });
    expect(result.jobs).toHaveLength(3);
    expect(result.warnings).toEqual(["Gone Inc (gone): Not found at the source (404)."]);
  });

  it("fails as a whole only when every board fails", async () => {
    await expect(run(greenhouseSource, { boards: [{ slug: "gone", name: "Gone Inc" }] })).rejects.toThrow(
      /All 1 company boards failed/,
    );
  });

  it("is unavailable without boards and rejects malformed responses", async () => {
    expect(greenhouseSource.unavailableReason(query, { boards: [] })).toMatch(/No company boards/);
    const routes = [{ match: "boards-api.greenhouse.io", body: { unexpected: true } }];
    await expect(run(greenhouseSource, config, routes)).rejects.toThrow();
  });
});

describe("Ashby adapter", () => {
  it("reads listed postings with structured countries and arrangement", async () => {
    const result = await run(ashbySource, { boards: [{ slug: "nordlicht", name: "Nordlicht Software" }] });
    expect(result.jobs).toHaveLength(ASHBY_BOARD.jobs.length - 1);
    expect(result.jobs[0]).toMatchObject({
      externalId: "nordlicht:a1b2c3d4-0000-4000-8000-000000000001",
      company: "Nordlicht Software",
      workArrangement: "hybrid",
      countryHints: ["Germany"],
    });
    expect(result.jobs[1]).toMatchObject({
      workArrangement: "remote",
      location: "Remote - European Union; Netherlands; Germany",
      countryHints: ["European Union", "Netherlands", "Germany"],
    });
    expect(result.jobs[0].descriptionText).toContain("visa sponsorship");
  });
});

describe("Lever adapter", () => {
  it("reads postings in the documented shape, including the EU host", async () => {
    const result = await run(leverSource, { boards: [{ slug: "fjordworks", name: "Fjordworks" }] });
    expect(result.calls[0].url).toBe("https://api.lever.co/v0/postings/fjordworks?mode=json");
    expect(result.jobs[0]).toMatchObject({
      externalId: "fjordworks:5f1e2d3c-1111-4222-8333-444455556666",
      title: "React Engineer",
      location: "Oslo",
      countryHints: ["NO"],
      workArrangement: "onsite",
    });
    expect(result.jobs[0].descriptionHtml).toContain("Relocation support is provided");

    const eu = await run(leverSource, { boards: [{ slug: "eu.fjordworks", name: "Fjordworks" }] }, [
      { match: "api.eu.lever.co/v0/postings/fjordworks", body: [] },
    ]);
    expect(eu.calls[0].url).toBe("https://api.eu.lever.co/v0/postings/fjordworks?mode=json");
  });
});

describe("Remotive adapter", () => {
  it("makes one request and marks every posting remote", async () => {
    const result = await run(remotiveSource, { category: "software-dev" });
    expect(result.calls).toHaveLength(1);
    expect(result.jobs).toHaveLength(REMOTIVE_FEED.jobs.length);
    expect(result.jobs[0]).toMatchObject({ workArrangement: "remote", location: "Europe" });
    expect(remotiveSource.limits.maxRequestsPerScan).toBe(1);
    expect(remotiveSource.limits.minIntervalMinutes).toBeGreaterThanOrEqual(360);
  });

  it("is skipped when remote work is not wanted", () => {
    expect(
      remotiveSource.unavailableReason({ ...query, workArrangements: ["onsite"] }, { category: "software-dev" }),
    ).toMatch(/Remote work is not among/);
    expect(
      remotiveSource.unavailableReason({ ...query, workArrangements: ["remote"] }, { category: "software-dev" }),
    ).toBeNull();
  });
});
