import { z } from "zod";
import type { AutomaticSource, SourceJob } from "./types";

/**
 * Offline source with a handful of invented postings, for demos and automated
 * browser tests. It contacts nothing. It exists only when
 * JOB_SCAN_ENABLE_DEMO_SOURCE=true, the counterpart of the mock AI provider;
 * never enable it on a real deployment, where it would mix invented jobs with
 * real ones.
 */
const configSchema = z.object({});
type Config = z.infer<typeof configSchema>;

const DAY = 24 * 60 * 60 * 1000;

const POSTINGS: Array<Omit<SourceJob, "postedAt"> & { daysAgo: number }> = [
  {
    externalId: "demo-1",
    url: "https://jobs.example.com/demo/senior-frontend-engineer-berlin",
    title: "Senior Frontend Engineer",
    company: "Lindenhof Software",
    location: "Berlin, Germany",
    workArrangement: "hybrid",
    daysAgo: 1,
    descriptionText: `Lindenhof Software builds scheduling tools for clinics.

What you will do
- Own our React and TypeScript web application
- Mentor other engineers and lead code reviews

Requirements
- Required: 5+ years of experience with React and TypeScript
- Required: experience with GraphQL APIs
- Nice to have: Playwright

What we offer
We offer visa sponsorship and a relocation package for candidates moving to Germany.`,
  },
  {
    externalId: "demo-2",
    url: "https://jobs.example.com/demo/react-developer-amsterdam",
    title: "React Developer",
    company: "Grachten Labs",
    location: "Amsterdam, Netherlands",
    workArrangement: "onsite",
    daysAgo: 3,
    descriptionText: `Grachten Labs is a payments startup in Amsterdam.

Requirements
- Required: 3+ years of React
- Required: TypeScript
- Nice to have: Node.js

Visa sponsorship may be available for exceptional candidates.`,
  },
  {
    externalId: "demo-3",
    url: "https://jobs.example.com/demo/frontend-engineer-vienna",
    title: "Frontend Engineer",
    company: "Donau Digital",
    location: "Vienna, Austria",
    daysAgo: 6,
    descriptionText: `Donau Digital builds travel booking products.

Requirements
- Required: React and TypeScript
- Required: experience with design systems

Benefits
- 30 days of holiday
- Learning budget`,
  },
  {
    externalId: "demo-4",
    url: "https://jobs.example.com/demo/frontend-engineer-london",
    title: "Frontend Engineer",
    company: "Thames Works",
    location: "London, United Kingdom",
    daysAgo: 2,
    descriptionText: `Thames Works is hiring in London.

Requirements
- Required: React
Applicants must have the right to work in the UK. We are unable to sponsor visas.`,
  },
  {
    externalId: "demo-5",
    url: "https://jobs.example.com/demo/account-manager-berlin",
    title: "Account Manager",
    company: "Lindenhof Software",
    location: "Berlin, Germany",
    daysAgo: 2,
    descriptionText: "Sales role for our clinic customers in Germany.",
  },
];

export const demoSource: AutomaticSource<Config> = {
  id: "demo",
  displayName: "Demo jobs",
  mode: "automatic",
  verified: true,
  enabledByDefault: true,
  homepage: "https://jobs.example.com",
  description:
    "Invented postings for demos and tests. Enabled by JOB_SCAN_ENABLE_DEMO_SOURCE; contacts nothing. Never enable on a real deployment.",
  attribution: "These postings are not real.",
  allowedHosts: [],
  limits: { maxRequestsPerScan: 0, minIntervalMinutes: 0, timeoutMs: 1_000 },
  configSchema,
  defaultConfig: {},
  unavailableReason: () => null,
  async fetchJobs() {
    const now = Date.now();
    return {
      jobs: POSTINGS.map(({ daysAgo, ...job }) => ({ ...job, postedAt: new Date(now - daysAgo * DAY) })),
      warnings: [],
    };
  },
};

/** Whether the demo source is switched on for this server. */
export function isDemoSourceEnabled(): boolean {
  const value = (process.env.JOB_SCAN_ENABLE_DEMO_SOURCE ?? "").toLowerCase();
  return value === "true" || value === "1";
}
