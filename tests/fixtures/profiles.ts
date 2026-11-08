import { careerProfileDataSchema, type CareerProfileData } from "@/features/career-profile/schema";
import { jobAnalysisSchema, type JobAnalysis } from "@/features/job-analysis/schema";

/** A confirmed, realistic profile for a senior frontend engineer. Ids are stable for assertions. */
export function sampleProfile(): CareerProfileData {
  return careerProfileDataSchema.parse({
    personal: {
      fullName: "Alex Rivera",
      headline: "Senior Frontend Engineer",
      email: "alex.rivera@example.com",
      phone: "+44 7700 900123",
      location: "London, UK",
      linkedinUrl: "https://www.linkedin.com/in/alexrivera",
      githubUrl: "https://github.com/alexrivera",
      links: [{ id: "link_blog", label: "Blog", url: "https://alexrivera.dev" }],
    },
    summary: {
      text: "Frontend engineer with 8 years of experience building React applications for fintech and e-commerce companies.",
      keyStrengths: ["React architecture", "Performance optimisation"],
      specializations: ["Design systems"],
      highlights: ["Led migration of a 400k LOC codebase to TypeScript"],
    },
    experience: [
      {
        id: "exp_acme",
        status: "confirmed",
        employer: "Acme Payments",
        title: "Senior Frontend Engineer",
        location: "London, UK",
        startDate: "Mar 2021",
        endDate: "",
        responsibilities: [
          {
            id: "stmt_acme_1",
            text: "Own the frontend architecture for the merchant dashboard built with React and TypeScript.",
          },
          { id: "stmt_acme_2", text: "Mentor four junior engineers and run weekly code review sessions." },
        ],
        achievements: [
          {
            id: "ach_acme_1",
            text: "Reduced dashboard load time by 40% by introducing route-based code splitting.",
            metrics: [{ id: "m1", label: "Load time reduction", value: "40%" }],
          },
          {
            id: "ach_acme_2",
            text: "Migrated 120 components to a shared design system, cutting UI defects by 30%.",
            metrics: [],
          },
        ],
        technologies: ["React", "TypeScript", "GraphQL", "Playwright"],
      },
      {
        id: "exp_shop",
        status: "confirmed",
        employer: "ShopNow",
        title: "Frontend Engineer",
        location: "Manchester, UK",
        startDate: "Jun 2017",
        endDate: "Feb 2021",
        responsibilities: [
          { id: "stmt_shop_1", text: "Built checkout flows in Vue.js and Node.js services for the storefront." },
        ],
        achievements: [
          { id: "ach_shop_1", text: "Increased checkout conversion by 12% through A/B tested redesign.", metrics: [] },
        ],
        technologies: ["Vue", "Node.js", "PostgreSQL"],
      },
    ],
    skills: [
      { id: "skill_react", status: "confirmed", name: "React", category: "Frameworks" },
      { id: "skill_ts", status: "confirmed", name: "TypeScript", category: "Languages" },
      { id: "skill_graphql", status: "confirmed", name: "GraphQL", category: "APIs" },
      { id: "skill_vue", status: "confirmed", name: "Vue", category: "Frameworks" },
      { id: "skill_node", status: "confirmed", name: "Node.js", category: "Backend" },
      { id: "skill_pg", status: "confirmed", name: "PostgreSQL", category: "Databases" },
      { id: "skill_imported", status: "imported", name: "Kubernetes", category: "Cloud" },
    ],
    projects: [
      {
        id: "proj_ds",
        status: "confirmed",
        name: "Open Design System",
        description: "Open-source React component library with accessible primitives.",
        role: "Maintainer",
        technologies: ["React", "TypeScript", "Storybook"],
        outcomes: [{ id: "out_ds_1", text: "Grew the library to 2,000 GitHub stars and 35 contributors." }],
        repositoryUrl: "https://github.com/alexrivera/open-design-system",
      },
    ],
    education: [
      {
        id: "edu_1",
        status: "confirmed",
        institution: "University of Manchester",
        degree: "BSc",
        fieldOfStudy: "Computer Science",
        startDate: "2013",
        endDate: "2017",
      },
    ],
    certifications: [
      {
        id: "cert_1",
        status: "confirmed",
        name: "AWS Certified Cloud Practitioner",
        issuer: "Amazon Web Services",
        date: "2022",
      },
    ],
    languages: [
      { id: "lang_en", status: "confirmed", language: "English", proficiency: "Native" },
      { id: "lang_es", status: "confirmed", language: "Spanish", proficiency: "Professional" },
    ],
    additionalSections: [
      {
        id: "sec_awards",
        status: "confirmed",
        kind: "awards",
        title: "Awards",
        items: [
          {
            id: "item_award",
            title: "Engineering Excellence Award",
            date: "2023",
            description: "Acme Payments annual award",
          },
        ],
      },
    ],
  });
}

export function sampleJobAnalysis(): JobAnalysis {
  return jobAnalysisSchema.parse({
    jobTitle: "Senior Frontend Engineer",
    seniority: "Senior",
    summary: "React/TypeScript role with leadership expectations.",
    requirements: [
      {
        id: "req_react",
        category: "technical_skill",
        description: "Expert React and TypeScript",
        priority: "high",
        classification: "mandatory",
        supportingText: "5+ years React and TypeScript required",
        relatedSkills: ["React", "TypeScript"],
      },
      {
        id: "req_arch",
        category: "responsibility",
        description: "Own frontend architecture decisions",
        priority: "high",
        classification: "mandatory",
        supportingText: "You will own frontend architecture",
        relatedSkills: [],
      },
      {
        id: "req_lead",
        category: "leadership",
        description: "Mentor engineers and lead code reviews",
        priority: "medium",
        classification: "preferred",
        supportingText: "Mentoring experience preferred",
        relatedSkills: ["mentoring"],
      },
      {
        id: "req_k8s",
        category: "technical_skill",
        description: "Experience deploying with Kubernetes",
        priority: "medium",
        classification: "mandatory",
        supportingText: "Kubernetes experience required",
        relatedSkills: ["Kubernetes"],
      },
      {
        id: "req_java",
        category: "preferred_skill",
        description: "Java backend development",
        priority: "low",
        classification: "preferred",
        supportingText: "Java a plus",
        relatedSkills: ["Java"],
      },
    ],
  });
}

/** A long profile used for pagination tests. */
export function longProfile(): CareerProfileData {
  const base = sampleProfile();
  const experience = Array.from({ length: 7 }, (_, i) => ({
    id: `exp_long_${i}`,
    status: "confirmed" as const,
    employer: i === 0 ? "A Very Long Company Name International Holdings Group Limited Partnership" : `Company ${i}`,
    title: `Software Engineer ${i}`,
    location: "Remote",
    startDate: `${2010 + i}`,
    endDate: `${2011 + i}`,
    responsibilities: Array.from({ length: 4 }, (_, j) => ({
      id: `stmt_long_${i}_${j}`,
      text: `Responsibility ${j} with a fairly long description that wraps across multiple lines when rendered in a narrow column of the resume template to exercise wrapping ${"and more text ".repeat(4)}.`,
    })),
    achievements: Array.from({ length: 3 }, (_, j) => ({
      id: `ach_long_${i}_${j}`,
      text: `Achievement ${j}: delivered measurable outcome number ${j + 1} for the business with a detailed explanation of context, action and result.`,
      metrics: [],
    })),
    technologies: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"],
  }));
  const skills = Array.from({ length: 40 }, (_, i) => ({
    id: `skill_long_${i}`,
    status: "confirmed" as const,
    name: `Skill ${i}`,
    category: i % 2 ? "Tools" : "Languages",
  }));
  const projects = Array.from({ length: 5 }, (_, i) => ({
    id: `proj_long_${i}`,
    status: "confirmed" as const,
    name: `Project ${i}`,
    description: "A project description.",
    role: "Lead",
    technologies: ["React"],
    outcomes: [{ id: `out_long_${i}`, text: `Outcome ${i} with details.` }],
    url: `https://example.com/a/very/long/url/path/that/keeps/going/and/going/for/a/while/project-${i}-with-many-segments`,
  }));
  return careerProfileDataSchema.parse({
    ...base,
    experience: [...base.experience, ...experience],
    skills: [...base.skills, ...skills],
    projects: [...base.projects, ...projects],
  });
}

/** Minimal profile with empty optional sections. */
export function minimalProfile(): CareerProfileData {
  return careerProfileDataSchema.parse({
    personal: { fullName: "Sam Minimal" },
    experience: [
      {
        id: "exp_min",
        status: "confirmed",
        employer: "Tiny Co",
        title: "Developer",
        startDate: "2020",
        endDate: "",
        responsibilities: [{ id: "stmt_min", text: "Built things." }],
        achievements: [],
        technologies: [],
      },
    ],
  });
}
