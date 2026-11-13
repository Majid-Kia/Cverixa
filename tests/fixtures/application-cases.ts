import { careerProfileDataSchema, type CareerProfileData } from "@/features/career-profile/schema";

/**
 * Fixtures for three reviewed applications (Partly, Polarsteps, Seamflow).
 *
 * The profile is synthetic: a frontend engineer whose strongest relevant work
 * sits in older roles (a fraud-detection portal, a tour-booking system) so it
 * falls on page two of an untailored resume. As in the reviews, nothing in it
 * states customer observation, adoption tracking, feedback-driven changes or
 * design ownership.
 *
 * The postings are short reconstructions written from the one-line
 * descriptions in the reviews. They are not the companies' real postings.
 */
export function candidateProfile(): CareerProfileData {
  return careerProfileDataSchema.parse({
    personal: {
      fullName: "Rowan Castell",
      headline: "Senior Frontend Engineer",
      email: "rowan.castell@example.com",
      phone: "+31 6 5550 0142",
      location: "Utrecht, Netherlands",
      linkedinUrl: "https://www.linkedin.com/in/rowancastell",
      githubUrl: "https://github.com/rowancastell",
    },
    summary: {
      text: "Frontend engineer with 10 years of experience building React and TypeScript products, from booking flows to data-heavy internal tools. Focused on performance, automated testing and maintainable component architecture.",
      keyStrengths: ["Web performance", "Automated testing"],
      specializations: ["React", "TypeScript"],
      highlights: [],
    },
    experience: [
      {
        id: "exp_northwind",
        status: "confirmed",
        employer: "Northwind Commerce",
        title: "Senior Frontend Engineer",
        location: "Amsterdam, Netherlands",
        startDate: "Mar 2022",
        endDate: "",
        achievements: [
          {
            id: "ach_nw_lcp",
            text: "Cut largest contentful paint on product pages from 4.1s to 2.3s by splitting bundles, lazy-loading images and removing render-blocking scripts.",
            metrics: [],
          },
          {
            id: "ach_nw_tests",
            text: "Raised end-to-end test coverage of the purchase flow from 35% to 80% with Playwright, replacing a two-day manual regression pass.",
            metrics: [],
          },
          {
            id: "ach_nw_ts",
            text: "Migrated 180 React components to strict TypeScript without a release freeze.",
            metrics: [],
          },
          {
            id: "ach_nw_ds",
            text: "Built a shared component library used by four product teams, with visual regression tests in CI.",
            metrics: [],
          },
        ],
        responsibilities: [
          {
            id: "stmt_nw_lead",
            text: "Lead frontend development for the purchase and account areas in React, TypeScript and Next.js.",
          },
          { id: "stmt_nw_review", text: "Review pull requests and mentor two junior engineers." },
          {
            id: "stmt_nw_perf",
            text: "Own the performance budget and Core Web Vitals monitoring for the web shop.",
          },
          { id: "stmt_nw_a11y", text: "Run accessibility audits and fix WCAG issues before each release." },
          { id: "stmt_nw_plan", text: "Plan quarterly frontend work with the product and design leads." },
        ],
        technologies: ["React", "TypeScript", "Next.js", "Playwright", "GraphQL"],
      },
      {
        id: "exp_corvid",
        status: "confirmed",
        employer: "Corvid Health",
        title: "Frontend Engineer",
        location: "Remote",
        startDate: "Jan 2020",
        endDate: "Feb 2022",
        achievements: [
          {
            id: "ach_cv_forms",
            text: "Rebuilt the appointment scheduling forms with schema-driven validation, cutting form-related support tickets by 30%.",
            metrics: [],
          },
          {
            id: "ach_cv_bundle",
            text: "Reduced the JavaScript bundle by 45% by replacing a legacy charting dependency.",
            metrics: [],
          },
        ],
        responsibilities: [
          { id: "stmt_cv_spa", text: "Developed the patient-facing web app in React and TypeScript with a REST API." },
          { id: "stmt_cv_tests", text: "Wrote unit and integration tests with Jest and React Testing Library." },
          { id: "stmt_cv_i18n", text: "Added internationalisation for Dutch, German and English." },
          {
            id: "stmt_cv_a11y",
            text: "Brought the appointment flow to WCAG 2.1 AA and verified it with screen-reader testing.",
          },
          { id: "stmt_cv_release", text: "Set up preview deployments and release checklists for the frontend team." },
        ],
        technologies: ["React", "TypeScript", "Jest", "REST"],
      },
      {
        id: "exp_ledgerline",
        status: "confirmed",
        employer: "Ledgerline",
        title: "Frontend Engineer",
        location: "Rotterdam, Netherlands",
        startDate: "Feb 2018",
        endDate: "Dec 2019",
        achievements: [
          {
            id: "ach_ll_portal",
            text: "Built the fraud-detection portal that analysts use to review flagged transactions, replacing three spreadsheets and a legacy admin screen.",
            metrics: [],
          },
          {
            id: "ach_ll_triage",
            text: "Cut average case handling time in the portal from 6 minutes to 4 by adding keyboard navigation and bulk actions.",
            metrics: [],
          },
        ],
        responsibilities: [
          {
            id: "stmt_ll_tables",
            text: "Developed data-dense tables with filtering, sorting and saved views for transaction review.",
          },
          { id: "stmt_ll_api", text: "Worked with the backend team on the GraphQL API for case data." },
        ],
        technologies: ["React", "TypeScript", "GraphQL"],
      },
      {
        id: "exp_zoomit",
        status: "confirmed",
        employer: "Zoomit",
        title: "Frontend Developer",
        location: "",
        startDate: "Sep 2015",
        endDate: "Jan 2018",
        achievements: [
          {
            id: "ach_zm_tours",
            text: "Built the tour-booking system with search and filtering, letting travellers compare and book tours online.",
            metrics: [],
          },
        ],
        responsibilities: [
          {
            id: "stmt_zm_pages",
            text: "Implemented responsive booking pages and a reusable date picker in JavaScript and Sass.",
          },
          { id: "stmt_zm_cms", text: "Maintained the marketing site and its content templates." },
        ],
        technologies: ["JavaScript", "Vue", "Sass"],
      },
    ],
    skills: [
      { id: "skill_react", status: "confirmed", name: "React", category: "Frontend" },
      { id: "skill_ts", status: "confirmed", name: "TypeScript", category: "Frontend" },
      { id: "skill_js", status: "confirmed", name: "JavaScript", category: "Frontend" },
      { id: "skill_next", status: "confirmed", name: "Next.js", category: "Frontend" },
      { id: "skill_vue", status: "confirmed", name: "Vue", category: "Frontend" },
      { id: "skill_html", status: "confirmed", name: "HTML", category: "Frontend" },
      { id: "skill_css", status: "confirmed", name: "CSS", category: "Frontend" },
      { id: "skill_sass", status: "confirmed", name: "Sass", category: "Frontend" },
      { id: "skill_playwright", status: "confirmed", name: "Playwright", category: "Testing" },
      { id: "skill_jest", status: "confirmed", name: "Jest", category: "Testing" },
      { id: "skill_graphql", status: "confirmed", name: "GraphQL", category: "APIs" },
      { id: "skill_rest", status: "confirmed", name: "REST", category: "APIs" },
      { id: "skill_a11y", status: "confirmed", name: "Accessibility", category: "Practices" },
      { id: "skill_perf", status: "confirmed", name: "Web performance", category: "Practices" },
    ],
    projects: [
      {
        id: "proj_fieldnotes",
        status: "confirmed",
        name: "Fieldnotes",
        description: "Offline-first note-taking web app for hikers.",
        role: "Creator",
        technologies: ["TypeScript", "Svelte"],
        outcomes: [
          {
            id: "out_fn_pwa",
            text: "Published as an open-source progressive web app with offline sync and installable builds.",
          },
        ],
        repositoryUrl: "https://github.com/rowancastell/fieldnotes",
      },
    ],
    education: [
      {
        id: "edu_delta",
        status: "confirmed",
        institution: "Delta Institute of Technology",
        degree: "BSc",
        fieldOfStudy: "Computer Engineering",
        startDate: "2011",
        endDate: "2015",
      },
    ],
    certifications: [],
    languages: [
      { id: "lang_en", status: "confirmed", language: "English", proficiency: "Fluent" },
      { id: "lang_nl", status: "confirmed", language: "Dutch", proficiency: "Professional" },
    ],
    additionalSections: [],
  });
}

export interface ApplicationCase {
  company: string;
  title: string;
  text: string;
}

/** Product builder who works directly with customers, ships end to end and measures how features perform. */
export const PARTLY: ApplicationCase = {
  company: "Partly",
  title: "Product Engineer",
  text: `Product Engineer at Partly

We are looking for a product builder.

What you'll do
- Work directly with customers to understand how they do their work today
- Ship features end to end, from first idea to production
- Measure how the features you ship perform and iterate on what you learn
- Build for complex operational workflows`,
};

/** Frontend engineer for a consumer travel product. */
export const POLARSTEPS: ApplicationCase = {
  company: "Polarsteps",
  title: "Frontend Engineer",
  text: `Frontend Engineer at Polarsteps

We are hiring a frontend engineer for our consumer travel product.

What you'll do
- Build features for a consumer travel product used by travellers around the world
- Own search and filtering experiences across the product
- Keep the product fast and well tested

Requirements
- Strong React and TypeScript
- Experience with automated testing and web performance`,
};

/** Front End Design Engineer who owns dense expert interfaces and explains design decisions; asks for a project note. */
export const SEAMFLOW: ApplicationCase = {
  company: "Seamflow",
  title: "Front End Design Engineer",
  text: `Front End Design Engineer at Seamflow

What you'll do
- Own dense, expert interfaces that operators work in all day
- Make interface design decisions and explain the reasoning behind them
- Prototype in code and iterate on feedback from users

How to apply
Send your CV with a short note about the hardest thing you have built.`,
};

export const APPLICATION_CASES = [PARTLY, POLARSTEPS, SEAMFLOW];

/** A posting with stated office, relocation and eligibility requirements (not one of the three reviews). */
export const POSTING_WITH_LOGISTICS = `Frontend Engineer

What you'll do
- Build React features for our logistics dashboard

Location
This is a hybrid role: three days a week in our Lisbon office.
We offer relocation support for candidates moving to Portugal.
You must already have the right to work in the EU; we cannot sponsor visas.

How to apply
Please include a link to your portfolio and a cover letter.`;
