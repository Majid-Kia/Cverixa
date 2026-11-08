import { findTechKeywords, containsTerm } from "@/features/job-analysis/keywords";
import type { CareerProfileData } from "@/features/career-profile/schema";
import type { JobAnalysis } from "@/features/job-analysis/schema";
import { DATA_TAGS, readDataBlock } from "../prompts/tags";
import { validateStructuredOutput } from "../json";
import type {
  AIModel,
  AIProvider,
  ProviderStatus,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from "../types";

export type MockHandler = (request: StructuredGenerationRequest<unknown>) => unknown;

export interface MockProviderOptions {
  /** Per-task overrides, mainly for tests. */
  handlers?: Record<string, MockHandler>;
}

export const MOCK_MODEL_ID = "mock-deterministic-v1";

/**
 * Deterministic provider for automated tests and offline demos. It never calls
 * the network and derives its output purely from the prompt data blocks.
 */
export class MockProvider implements AIProvider {
  readonly id = "mock" as const;
  readonly displayName = "Mock (testing)";
  readonly paid = false;
  readonly calls: Array<{ task: string; modelId: string }> = [];

  constructor(private readonly options: MockProviderOptions = {}) {}

  async listModels(): Promise<AIModel[]> {
    return [{ id: MOCK_MODEL_ID, displayName: "Mock deterministic", supportsStructuredOutput: true }];
  }

  async checkConnection(): Promise<ProviderStatus> {
    return { providerId: "mock", available: true, message: "Mock provider is always available.", paid: false };
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    this.calls.push({ task: request.task, modelId: request.modelId });
    const handler = this.options.handlers?.[request.task];
    const raw = handler ? handler(request as StructuredGenerationRequest<unknown>) : defaultHandler(request);
    const data = validateStructuredOutput("mock", request.schema, raw);
    return { data, modelId: MOCK_MODEL_ID, durationMs: 1 };
  }
}

function defaultHandler(request: StructuredGenerationRequest<unknown>): unknown {
  switch (request.task) {
    case "job_analysis":
      return mockJobAnalysis(readDataBlock(request.user, DATA_TAGS.jobDescription) ?? "");
    case "resume_tailoring":
      return mockTailoring(
        parseJson<CareerProfileData>(readDataBlock(request.user, DATA_TAGS.profileJson)),
        parseJson<JobAnalysis>(readDataBlock(request.user, DATA_TAGS.jobAnalysisJson)),
      );
    case "profile_import":
      return mockImport(readDataBlock(request.user, DATA_TAGS.resumeText) ?? "");
    default:
      throw new Error(`Mock provider has no handler for task "${request.task}".`);
  }
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function mockJobAnalysis(text: string) {
  const keywords = findTechKeywords(text);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const titleLine =
    lines.find((line) => /engineer|developer|architect|manager|lead|designer|analyst/i.test(line)) ?? "";
  const mandatoryBlock =
    text.match(/(required|must have|requirements)[\s\S]*?(?=preferred|nice to have|bonus|$)/i)?.[0] ?? text;
  type MockRequirement = {
    category: string;
    description: string;
    priority: string;
    classification: string;
    supportingText: string;
    relatedSkills: string[];
  };
  const requirements: MockRequirement[] = keywords.map((keyword) => ({
    category: "technical_skill" as const,
    description: `Experience with ${keyword}`,
    priority: "high" as const,
    classification: containsTerm(mandatoryBlock, keyword) ? ("mandatory" as const) : ("preferred" as const),
    supportingText: lines.find((line) => containsTerm(line, keyword))?.slice(0, 300) ?? "",
    relatedSkills: [keyword],
  }));
  if (/lead|mentor|manage/i.test(text)) {
    requirements.push({
      category: "leadership",
      description: "Leadership or mentoring responsibilities",
      priority: "medium",
      classification: "preferred",
      supportingText: lines.find((line) => /lead|mentor|manage/i.test(line))?.slice(0, 300) ?? "",
      relatedSkills: ["leadership", "mentoring"],
    });
  }
  if (requirements.length === 0) {
    requirements.push({
      category: "responsibility",
      description: "General responsibilities described in the posting",
      priority: "medium",
      classification: "preferred",
      supportingText: lines[0]?.slice(0, 300) ?? "",
      relatedSkills: [],
    });
  }
  return {
    jobTitle: titleLine.slice(0, 120),
    seniority: /senior|staff|principal|lead/i.test(text)
      ? "Senior"
      : /junior|entry/i.test(text)
        ? "Junior"
        : "Mid-level",
    summary: `Mock analysis derived from ${keywords.length} recognised technical terms.`,
    requirements,
  };
}

export function mockTailoring(profile: CareerProfileData | null, analysis: JobAnalysis | null) {
  if (!profile) throw new Error("Mock tailoring requires a profile_json block.");
  const jobTerms = (analysis?.requirements ?? []).flatMap((requirement) => requirement.relatedSkills);
  const firstExperience = profile.experience[0];
  const summarySources = firstExperience
    ? [
        ...firstExperience.achievements.slice(0, 2).map((a) => a.id),
        ...firstExperience.responsibilities.slice(0, 1).map((r) => r.id),
      ]
    : [];
  const summaryText =
    profile.summary.text ||
    (firstExperience ? `${firstExperience.title} with experience at ${firstExperience.employer}.` : "");
  const experience = profile.experience.map((entry) => ({
    id: entry.id,
    bullets: [
      ...entry.achievements.map((achievement) => ({ text: achievement.text, sourceIds: [achievement.id] })),
      ...entry.responsibilities.map((statement) => ({ text: statement.text, sourceIds: [statement.id] })),
    ].slice(0, 6),
  }));
  const projects = profile.projects.map((project) => ({
    id: project.id,
    bullets: project.outcomes.map((outcome) => ({ text: outcome.text, sourceIds: [outcome.id] })),
  }));
  const relevant = profile.skills.filter((skill) =>
    jobTerms.some((term) => containsTerm(skill.name, term) || containsTerm(term, skill.name)),
  );
  const rest = profile.skills.filter((skill) => !relevant.includes(skill));
  return {
    summary: { text: summaryText, sourceIds: summaryText ? summarySources : [] },
    experience,
    projects,
    skillIds: [...relevant, ...rest].map((skill) => skill.id),
    sectionOrder: [
      "summary",
      "experience",
      "skills",
      "projects",
      "education",
      "certifications",
      "languages",
      "additional",
    ],
    changeNotes: ["Mock provider: kept original wording and prioritised skills matching the job analysis."],
  };
}

export function mockImport(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
  const phone = text.match(/\+?\d[\d\s().-]{7,}\d/)?.[0]?.trim() ?? "";
  const fullName =
    lines.find((line) => !line.includes("@") && !/\d{3}/.test(line) && line.split(" ").length <= 5) ?? "";
  const skills = findTechKeywords(text).map((keyword) => ({ name: keyword, category: "Technical", proficiency: "" }));
  const experience: Array<{
    employer: string;
    title: string;
    location: string;
    startDate: string;
    endDate: string;
    responsibilities: string[];
    achievements: string[];
    technologies: string[];
  }> = [];
  const pattern =
    /^(.+?)\s+(?:at|@)\s+(.+?)\s*[(|,]\s*(\w+\s*\d{4}|\d{4})\s*[-–—to]+\s*(present|current|\w+\s*\d{4}|\d{4})\)?/i;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(pattern);
    if (!match) continue;
    const bullets: string[] = [];
    for (let j = i + 1; j < lines.length && /^[-*•]/.test(lines[j]); j += 1) {
      bullets.push(lines[j].replace(/^[-*•]\s*/, ""));
    }
    experience.push({
      title: match[1].trim(),
      employer: match[2].trim(),
      location: "",
      startDate: match[3].trim(),
      endDate: /present|current/i.test(match[4]) ? "" : match[4].trim(),
      responsibilities: [],
      achievements: bullets,
      technologies: findTechKeywords(bullets.join(" ")),
    });
  }
  return {
    personal: {
      fullName,
      headline: "",
      email,
      phone,
      location: "",
      linkedinUrl: "",
      githubUrl: "",
      portfolioUrl: "",
      links: [],
    },
    summary: { text: "", keyStrengths: [], specializations: [], highlights: [] },
    experience,
    skills,
    projects: [],
    education: [],
    certifications: [],
    languages: [],
    additionalSections: [],
    warnings: ["Mock provider output: review every field before confirming."],
  };
}
