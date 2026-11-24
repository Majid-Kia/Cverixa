/**
 * Recorded-shape responses of the job sources, with invented companies and
 * postings. Tests route source requests to these by URL, so no test touches
 * the network.
 */

export const ARBEITNOW_PAGE = {
  data: [
    {
      slug: "senior-frontend-engineer-berlin-1001",
      company_name: "Nordlicht Software GmbH",
      title: "Senior Frontend Engineer (m/f/d)",
      description:
        "<p>Nordlicht builds booking software for independent hotels.</p><h2>What you will do</h2><ul><li>Own our React and TypeScript booking flow</li><li>Mentor junior engineers</li></ul><h2>Requirements</h2><ul><li>Required: 5+ years of experience with React and TypeScript</li><li>Nice to have: GraphQL</li></ul><h2>What we offer</h2><p>We offer visa sponsorship and a relocation package for candidates moving to Germany.</p>",
      remote: false,
      url: "https://www.arbeitnow.com/jobs/companies/nordlicht/senior-frontend-engineer-berlin-1001",
      tags: ["react"],
      job_types: ["full time"],
      location: "Berlin",
      created_at: 1795470325,
    },
    {
      slug: "react-developer-munich-1002",
      company_name: "Alpenblick AG",
      title: "React Developer",
      description:
        "<p>Join our product team in Munich.</p><ul><li>Required: 3+ years of React</li><li>Required: TypeScript</li></ul>",
      remote: false,
      url: "https://www.arbeitnow.com/jobs/companies/alpenblick/react-developer-munich-1002",
      tags: [],
      job_types: [],
      location: "Munich, Germany",
      created_at: 1795383925,
    },
    {
      slug: "frontend-engineer-london-1003",
      company_name: "Thames Digital Ltd",
      title: "Frontend Engineer",
      description: "<p>Hybrid role in our London office. React, TypeScript and testing.</p>",
      remote: false,
      url: "https://www.arbeitnow.com/jobs/companies/thames/frontend-engineer-london-1003",
      tags: [],
      job_types: [],
      location: "London, UK",
      created_at: 1795297525,
    },
    {
      slug: "account-manager-berlin-1004",
      company_name: "Nordlicht Software GmbH",
      title: "Account Manager",
      description: "<p>Sales role.</p>",
      remote: false,
      url: "https://www.arbeitnow.com/jobs/companies/nordlicht/account-manager-berlin-1004",
      tags: [],
      job_types: [],
      location: "Berlin",
      created_at: 1795211125,
    },
  ],
  links: { first: "x", last: null, prev: null, next: null },
  meta: { current_page: 1 },
};

export const GREENHOUSE_BOARD = {
  jobs: [
    {
      id: 7001,
      title: "Staff Frontend Engineer",
      absolute_url: "https://job-boards.greenhouse.io/kanaal/jobs/7001?gh_src=feed",
      company_name: "Kanaal",
      location: { name: "Amsterdam, Netherlands" },
      offices: [{ id: 1, name: "Amsterdam", location: "Amsterdam, Netherlands" }],
      content:
        "&lt;p&gt;Kanaal is a payments company.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Required: React, TypeScript and GraphQL&lt;/li&gt;&lt;li&gt;Required: experience leading frontend architecture&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;Visa sponsorship may be available for exceptional candidates.&lt;/p&gt;",
      first_published: "2026-11-18T09:00:00-05:00",
      updated_at: "2026-11-20T09:00:00-05:00",
    },
    {
      id: 7002,
      title: "Senior Frontend Engineer",
      absolute_url: "https://job-boards.greenhouse.io/kanaal/jobs/7002",
      company_name: "Kanaal",
      location: { name: "Vienna" },
      offices: [],
      content:
        "&lt;p&gt;Work on our merchant dashboard.&lt;/p&gt;&lt;p&gt;Required: React and TypeScript.&lt;/p&gt;&lt;p&gt;Applicants must have the right to work in Austria. We are unable to sponsor visas.&lt;/p&gt;",
      first_published: "2026-11-10T09:00:00-05:00",
      updated_at: "2026-11-10T09:00:00-05:00",
    },
    {
      id: 7003,
      title: "Frontend Engineer",
      absolute_url: "https://job-boards.greenhouse.io/kanaal/jobs/7003",
      company_name: "Kanaal",
      location: { name: "New York, NY" },
      offices: [],
      content: "&lt;p&gt;React role in New York.&lt;/p&gt;",
      first_published: "2026-11-09T09:00:00-05:00",
      updated_at: "2026-11-09T09:00:00-05:00",
    },
  ],
  meta: { total: 3 },
};

export const ASHBY_BOARD = {
  apiVersion: "1",
  jobs: [
    {
      id: "a1b2c3d4-0000-4000-8000-000000000001",
      title: "Senior Frontend Engineer",
      location: "Berlin",
      secondaryLocations: [],
      isListed: true,
      isRemote: false,
      workplaceType: "Hybrid",
      address: { postalAddress: { addressCountry: "Germany", addressLocality: "Berlin" } },
      jobUrl: "https://jobs.ashbyhq.com/nordlicht/a1b2c3d4-0000-4000-8000-000000000001",
      applyUrl: "https://jobs.ashbyhq.com/nordlicht/a1b2c3d4-0000-4000-8000-000000000001/application",
      // The same job Arbeitnow lists for Nordlicht: a cross-source duplicate.
      descriptionPlain:
        "Nordlicht builds booking software for independent hotels. Required: 5+ years of experience with React and TypeScript. We offer visa sponsorship and a relocation package.",
      publishedAt: "2026-11-19T08:00:00.000+00:00",
    },
    {
      id: "a1b2c3d4-0000-4000-8000-000000000002",
      title: "Frontend Tech Lead",
      location: "Remote - European Union",
      secondaryLocations: [
        { location: "Netherlands", address: { postalAddress: { addressCountry: "Netherlands" } } },
        { location: "Germany", address: { postalAddress: { addressCountry: "Germany" } } },
      ],
      isListed: true,
      isRemote: true,
      workplaceType: "Remote",
      address: { postalAddress: { addressCountry: "European Union" } },
      jobUrl: "https://jobs.ashbyhq.com/nordlicht/a1b2c3d4-0000-4000-8000-000000000002",
      applyUrl: "https://jobs.ashbyhq.com/nordlicht/a1b2c3d4-0000-4000-8000-000000000002/application",
      descriptionPlain: "Lead our frontend team. Required: React, TypeScript, leading a team of engineers.",
      publishedAt: "2026-11-15T08:00:00.000+00:00",
    },
    {
      id: "a1b2c3d4-0000-4000-8000-000000000003",
      title: "Unlisted Frontend Engineer",
      location: "Berlin",
      isListed: false,
      jobUrl: "https://jobs.ashbyhq.com/nordlicht/a1b2c3d4-0000-4000-8000-000000000003",
      descriptionPlain: "Hidden posting.",
    },
  ],
};

export const LEVER_BOARD = [
  {
    id: "5f1e2d3c-1111-4222-8333-444455556666",
    text: "React Engineer",
    hostedUrl: "https://jobs.lever.co/fjordworks/5f1e2d3c-1111-4222-8333-444455556666",
    applyUrl: "https://jobs.lever.co/fjordworks/5f1e2d3c-1111-4222-8333-444455556666/apply",
    createdAt: 1795000000000,
    country: "NO",
    workplaceType: "on-site",
    categories: { location: "Oslo", allLocations: ["Oslo"], team: "Engineering", commitment: "Full-time" },
    descriptionPlain: "Fjordworks builds tools for shipping companies.",
    lists: [{ text: "Requirements", content: "<li>React</li><li>TypeScript</li>" }],
    additionalPlain: "Relocation support is provided for candidates moving to Norway.",
  },
];

export const REMOTIVE_FEED = {
  "0-legal-notice": "fixture",
  jobs: [
    {
      id: 900001,
      url: "https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-900001",
      title: "Senior Frontend Engineer",
      company_name: "Driftwood Labs",
      candidate_required_location: "Europe",
      publication_date: "2026-11-19T14:58:42",
      description: "<p>Fully remote React role for candidates in Europe.</p>",
    },
    {
      id: 900002,
      url: "https://remotive.com/remote-jobs/software-dev/frontend-engineer-900002",
      title: "Frontend Engineer",
      company_name: "Prairie Systems",
      candidate_required_location: "USA, Canada",
      publication_date: "2026-11-18T10:00:00",
      description: "<p>Remote in North America only.</p>",
    },
  ],
};

export interface FetchCall {
  url: string;
}

type Route = {
  match: string | RegExp;
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  fail?: boolean;
};

/**
 * A `fetch` replacement that answers from the routes above. Unmatched URLs
 * answer 404, so a test fails loudly instead of reaching the network.
 */
export function mockFetch(routes: Route[]): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push({ url });
    const route = routes.find((item) =>
      typeof item.match === "string" ? url.includes(item.match) : item.match.test(url),
    );
    if (!route) return new Response("not found", { status: 404 });
    if (route.fail) throw new TypeError("fetch failed");
    return new Response(typeof route.body === "string" ? route.body : JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json", ...(route.headers ?? {}) },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/** Routes for every source answering normally. */
export const ALL_SOURCES_OK: Route[] = [
  { match: "arbeitnow.com/api/job-board-api", body: ARBEITNOW_PAGE },
  { match: "boards-api.greenhouse.io/v1/boards/kanaal/jobs", body: GREENHOUSE_BOARD },
  { match: "api.ashbyhq.com/posting-api/job-board/nordlicht", body: ASHBY_BOARD },
  { match: "api.lever.co/v0/postings/fjordworks", body: LEVER_BOARD },
  { match: "remotive.com/api/remote-jobs", body: REMOTIVE_FEED },
];
