import { describe, expect, it } from "vitest";
import {
  dedupeCandidates,
  inferArrangement,
  processSourceJob,
  type ListingFilters,
} from "@/features/job-scanner/pipeline";
import type { SourceJob } from "@/features/job-scanner/sources/types";
import {
  buildDedupeKey,
  canonicalUrl,
  descriptionHash,
  htmlToText,
  matchKeywords,
  normalizeCompany,
} from "@/features/job-scanner/text";

const filters: ListingFilters = {
  keywords: ["Frontend Engineer", "React Developer"],
  countries: ["DE"],
  workArrangements: ["onsite", "hybrid"],
  requireSponsorship: false,
  excludeWorkAuthRequired: true,
  excludeNoSponsorship: true,
};

const job = (overrides: Partial<SourceJob> = {}): SourceJob => ({
  externalId: "42",
  url: "https://boards.example.com/acme/jobs/42?gh_src=abc",
  title: "Senior Frontend Engineer (m/f/d)",
  company: "Acme GmbH",
  location: "Berlin, Germany",
  descriptionHtml: "<p>Build our React application.</p><ul><li>TypeScript</li><li>Testing</li></ul>",
  ...overrides,
});

describe("posting text", () => {
  it("turns HTML into plain text and removes scripts and markup", () => {
    const text = htmlToText(
      `<h2>About</h2><p>We build <strong>payments</strong> &amp; more.</p><script>alert("x")</script>
       <ul><li>React</li><li>TypeScript</li></ul><img src=x onerror="alert(1)"><p>Apply&nbsp;now</p>`,
    );
    expect(text).toContain("We build payments & more.");
    expect(text).toContain("- React");
    expect(text).toContain("- TypeScript");
    expect(text).not.toMatch(/<|>|alert|onerror/);
  });

  it("decodes entity-escaped HTML as Greenhouse returns it", () => {
    const text = htmlToText("&lt;p&gt;We offer &lt;strong&gt;visa sponsorship&lt;/strong&gt;.&lt;/p&gt;");
    expect(text).toBe("We offer visa sponsorship.");
  });

  it("hashes the same text identically whatever the whitespace", () => {
    expect(descriptionHash("Build  our\nReact app")).toBe(descriptionHash("build our react app"));
    expect(descriptionHash("Build our React app")).not.toBe(descriptionHash("Build our Vue app"));
  });
});

describe("posting URLs", () => {
  it("accepts http(s) links and removes tracking parameters and fragments", () => {
    expect(canonicalUrl("https://jobs.example.com/a/1?utm_source=x&gh_src=y&team=web#apply")).toBe(
      "https://jobs.example.com/a/1?team=web",
    );
  });

  it("rejects anything that is not a plain web link", () => {
    expect(canonicalUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(canonicalUrl("file:///etc/passwd")).toBeNull();
    expect(canonicalUrl("https://user:secret@example.com/job")).toBeNull();
    expect(canonicalUrl("http://localhost/job")).toBeNull();
    expect(canonicalUrl("not a url")).toBeNull();
    expect(canonicalUrl(null)).toBeNull();
  });
});

describe("title matching", () => {
  it("matches a keyword when every word is in the title, in any form", () => {
    expect(matchKeywords("Senior Front-End Software Developer (React)", ["Frontend Engineer"])).toEqual([
      "Frontend Engineer",
    ]);
    expect(matchKeywords("React Engineer", ["React Developer"])).toEqual(["React Developer"]);
    expect(matchKeywords("Software Engineer, Frontend", ["Software Engineer (Frontend)"])).toEqual([
      "Software Engineer (Frontend)",
    ]);
    expect(matchKeywords("Sr. Frontend Engineer", ["Senior Frontend Engineer"])).toEqual(["Senior Frontend Engineer"]);
  });

  it("leaves out titles that match an exclusion line", () => {
    const keywords = ["React Engineer", "Frontend Engineer", "-React Native", "-Intern"];
    expect(matchKeywords("Senior React Engineer", keywords)).toEqual(["React Engineer"]);
    expect(matchKeywords("Senior Mobile Engineer (React Native)", keywords)).toEqual([]);
    expect(matchKeywords("Frontend Engineer Intern", keywords)).toEqual([]);
    expect(matchKeywords("Native Mobile Engineer", keywords)).toEqual([]);
    // An exclusion on its own is not something to search for.
    expect(matchKeywords("React Native Developer", ["-Frontend"])).toEqual([]);
  });

  it("does not match unrelated titles", () => {
    expect(matchKeywords("Backend Engineer", ["Frontend Engineer"])).toEqual([]);
    expect(matchKeywords("Account Manager", ["Frontend Engineer", "React Developer"])).toEqual([]);
    expect(matchKeywords("Frontend Engineer", ["Senior Frontend Engineer"])).toEqual([]);
    expect(matchKeywords("Engineer", [""])).toEqual([]);
  });
});

describe("duplicate signatures", () => {
  it("gives the same key to copies of one job from different sources", () => {
    const first = buildDedupeKey({
      company: "Acme GmbH",
      title: "Senior Frontend Engineer (m/f/d)",
      countryCode: "DE",
      city: "Berlin",
    });
    const second = buildDedupeKey({
      company: "ACME",
      title: "Senior Front-End Engineer",
      countryCode: "DE",
      city: "berlin",
    });
    expect(first).toBe(second);
    expect(normalizeCompany("Acme Technologies Ltd.")).toBe("acme");
  });

  it("keeps different jobs apart", () => {
    const base = { company: "Acme", title: "Frontend Engineer", countryCode: "DE", city: "Berlin" };
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, city: "Munich" }));
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, title: "Backend Engineer" }));
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, company: "Globex" }));
  });

  it("removes copies within one scan before anything is saved or analysed", () => {
    const keep = (item: SourceJob, sourceId: string) => {
      const result = processSourceJob(item, { id: sourceId, label: sourceId }, filters);
      if (result.kind !== "keep") throw new Error(`expected keep, got ${result.reason}`);
      return result.candidate;
    };
    const candidates = [
      keep(job(), "greenhouse"),
      keep(job({ externalId: "42" }), "greenhouse"),
      keep(job({ externalId: "other-id", url: "https://www.arbeitnow.com/jobs/acme-senior-frontend" }), "arbeitnow"),
      keep(
        job({ externalId: "77", url: "https://boards.example.com/acme/jobs/77", title: "React Developer" }),
        "greenhouse",
      ),
    ];
    const { unique, duplicates } = dedupeCandidates(candidates);
    expect(unique).toHaveLength(2);
    expect(duplicates).toBe(2);
    expect(unique.map((candidate) => candidate.title)).toEqual(["Senior Frontend Engineer (m/f/d)", "React Developer"]);
  });
});

describe("processing a posting", () => {
  it("normalises a kept posting", () => {
    const result = processSourceJob(job(), { id: "greenhouse", label: "Greenhouse" }, filters);
    expect(result.kind).toBe("keep");
    if (result.kind !== "keep") return;
    expect(result.candidate).toMatchObject({
      sourceId: "greenhouse",
      url: "https://boards.example.com/acme/jobs/42",
      countryCode: "DE",
      city: "Berlin",
      matchedKeywords: ["Frontend Engineer"],
    });
    expect(result.candidate.description).toContain("- TypeScript");
    expect(result.candidate.visa.sponsorship.status).toBe("unknown");
  });

  it.each([
    [{ title: "Account Executive" }, "title"],
    [{ location: "Paris, France" }, "other_country"],
    [{ location: "Flexible" }, "unresolved_location"],
    [{ url: "javascript:alert(1)" }, "invalid"],
    [{ company: "  " }, "invalid"],
    [{ workArrangement: "remote" as const, location: "Germany" }, "work_arrangement"],
    [{ descriptionText: "We are unable to sponsor visas for this role." }, "no_sponsorship"],
    [{ descriptionText: "Applicants must have the right to work in Germany." }, "work_authorization_required"],
  ])("leaves out %j because of %s", (overrides, reason) => {
    const result = processSourceJob(job(overrides), { id: "test", label: "Test" }, filters);
    expect(result).toEqual({ kind: "skip", reason });
  });

  it("keeps only confirmed or possible sponsorship when sponsorship is required", () => {
    const strict = { ...filters, requireSponsorship: true };
    const source = { id: "test", label: "Test" };
    expect(processSourceJob(job(), source, strict)).toEqual({ kind: "skip", reason: "sponsorship_not_stated" });
    expect(
      processSourceJob(job({ descriptionText: "We offer visa sponsorship for this role." }), source, strict).kind,
    ).toBe("keep");
    expect(processSourceJob(job({ sponsorshipFlag: true }), source, strict).kind).toBe("keep");
  });

  it("reads the work arrangement from the source, the location or the posting", () => {
    expect(inferArrangement("hybrid", "Berlin", "Engineer", "")).toBe("hybrid");
    expect(inferArrangement(undefined, "Berlin (Hybrid)", "Engineer", "")).toBe("hybrid");
    expect(inferArrangement("unknown", "Remote - Germany", "Engineer", "")).toBe("remote");
    expect(inferArrangement(undefined, "Berlin", "Engineer", "This is a fully remote position.")).toBe("remote");
    expect(inferArrangement(undefined, "Berlin", "Engineer", "Join our team.")).toBe("unknown");
  });
});

describe("one-line fields from a source", () => {
  it("removes markup, control characters and bytes the database cannot store", () => {
    const result = processSourceJob(
      job({
        title: "Senior <b>Frontend</b>\u0000 Engineer\n&amp; Lead",
        company: "Acme\tGmbH\u0007",
        location: " Berlin,\r\nGermany ",
      }),
      { id: "test", label: "Test" },
      filters,
    );
    expect(result.kind).toBe("keep");
    if (result.kind !== "keep") return;
    expect(result.candidate.title).toBe("Senior Frontend Engineer & Lead");
    expect(result.candidate.company).toBe("Acme GmbH");
    expect(result.candidate.location).toBe("Berlin, Germany");
    expect(JSON.stringify(result.candidate)).not.toContain("\\u0000");
  });
});

describe("offline demo source", () => {
  it("is not registered unless it is switched on, and contacts nothing", async () => {
    const { AUTOMATIC_SOURCES } = await import("@/features/job-scanner/sources/registry");
    const { demoSource, isDemoSourceEnabled } = await import("@/features/job-scanner/sources/demo");
    expect(isDemoSourceEnabled()).toBe(false);
    expect(AUTOMATIC_SOURCES.map((source) => source.id)).not.toContain("demo");
    expect(demoSource.allowedHosts).toEqual([]);
    const http = {
      requestCount: 0,
      getJson: async () => {
        throw new Error("the demo source must not make requests");
      },
    };
    const { jobs } = await demoSource.fetchJobs({ keywords: [], countries: [], workArrangements: [] }, {}, { http });
    expect(jobs.length).toBeGreaterThanOrEqual(4);
    expect(jobs.every((item) => item.url.startsWith("https://jobs.example.com/"))).toBe(true);
  });
});

describe("double-encoded descriptions", () => {
  it("removes markup that only appears after entities are decoded", () => {
    const text = htmlToText(
      '<p>We can &lt;span style="text-decoration: underline;"&gt;provide visa support&lt;/span&gt;.&lt;/p&gt;</p><p>&amp;lt;b&amp;gt;Apply&amp;lt;/b&amp;gt; now</p>',
    );
    expect(text).toBe("We can provide visa support.\n\nApply now");
  });
});
