import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jobAnalysisAiOutputSchema } from "@/features/job-analysis/schema";
import { tailoringAiOutputSchema } from "@/features/resume-tailoring/schema";
import { extractJsonObject, toProviderJsonSchema, validateStructuredOutput, withTimeout } from "@/server/ai/json";
import { buildJobAnalysisUserPrompt } from "@/server/ai/prompts/job-analysis";
import { buildResumeTailoringUserPrompt } from "@/server/ai/prompts/resume-tailoring";
import { MockProvider } from "@/server/ai/providers/mock";
import { OllamaProvider, validateOllamaBaseUrl } from "@/server/ai/providers/ollama";
import { normalizeOpenAIError } from "@/server/ai/providers/openai";
import { normalizeAnthropicError } from "@/server/ai/providers/anthropic";
import { AIProviderError } from "@/server/ai/types";
import { matchEvidence } from "@/features/resume-tailoring/evidence";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { sampleJobAnalysis, sampleProfile } from "../fixtures/profiles";

describe("structured output helpers", () => {
  it("extracts JSON from fenced and prose-wrapped responses", () => {
    expect(extractJsonObject('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Sure! {"a": {"b": [1,2]}} done')).toEqual({ a: { b: [1, 2] } });
    expect(extractJsonObject("no json here")).toBeNull();
  });

  it("validates output independently of the provider", () => {
    const schema = z.object({ name: z.string() });
    expect(validateStructuredOutput("mock", schema, { name: "x" })).toEqual({ name: "x" });
    expect(() => validateStructuredOutput("mock", schema, { name: 1 })).toThrowError(AIProviderError);
    expect(() => validateStructuredOutput("mock", schema, null)).toThrowError(/no parseable JSON/);
  });

  it("produces provider JSON schemas without the $schema key", () => {
    const json = toProviderJsonSchema(tailoringAiOutputSchema);
    expect(json.$schema).toBeUndefined();
    expect(json.type).toBe("object");
  });

  it("times out slow providers with a normalized error", async () => {
    const never = new Promise<string>(() => undefined);
    await expect(withTimeout("ollama", never, 10)).rejects.toMatchObject({ category: "timeout", retryable: true });
  });
});

describe("MockProvider", () => {
  const profile = confirmedFactsOnly(sampleProfile());
  const analysis = sampleJobAnalysis();

  it("analyses a job description deterministically", async () => {
    const provider = new MockProvider();
    const user = buildJobAnalysisUserPrompt({
      text: "Senior React Engineer\nRequired: React, TypeScript, Kubernetes.\nNice to have: GraphQL.\nYou will mentor engineers.",
    });
    const result = await provider.generateStructured({
      task: "job_analysis",
      modelId: "mock",
      schema: jobAnalysisAiOutputSchema,
      jsonSchema: {},
      system: "",
      user,
    });
    const skills = result.data.requirements.flatMap((requirement) => requirement.relatedSkills);
    expect(skills).toEqual(expect.arrayContaining(["react", "typescript", "kubernetes", "graphql"]));
    expect(result.data.requirements.find((r) => r.relatedSkills.includes("react"))?.classification).toBe("mandatory");
    expect(result.data.requirements.some((r) => r.category === "leadership")).toBe(true);
  });

  it("tailors using only profile facts with source ids", async () => {
    const provider = new MockProvider();
    const user = buildResumeTailoringUserPrompt({ profile, analysis, evidence: matchEvidence(profile, analysis) });
    const result = await provider.generateStructured({
      task: "resume_tailoring",
      modelId: "mock",
      schema: tailoringAiOutputSchema,
      jsonSchema: {},
      system: "",
      user,
    });
    expect(result.data.experience[0].id).toBe("exp_acme");
    expect(result.data.experience[0].bullets.every((bullet) => bullet.sourceIds.length === 1)).toBe(true);
    expect(result.data.skillIds[0]).toBe("skill_react");
  });

  it("supports per-task overrides for tests", async () => {
    const provider = new MockProvider({ handlers: { job_analysis: () => ({ jobTitle: "Custom", requirements: [] }) } });
    const result = await provider.generateStructured({
      task: "job_analysis",
      modelId: "mock",
      schema: jobAnalysisAiOutputSchema,
      jsonSchema: {},
      system: "",
      user: "",
    });
    expect(result.data.jobTitle).toBe("Custom");
    expect(provider.calls).toEqual([{ task: "job_analysis", modelId: "mock" }]);
  });
});

describe("Ollama endpoint safety (PRD 15.5)", () => {
  it("accepts local http endpoints in development", () => {
    expect(validateOllamaBaseUrl("http://localhost:11434", { restrictHosts: false, allowedHosts: [] }).ok).toBe(true);
  });

  it("rejects non-http schemes and embedded credentials", () => {
    expect(validateOllamaBaseUrl("file:///etc/passwd", { restrictHosts: false, allowedHosts: [] }).ok).toBe(false);
    expect(validateOllamaBaseUrl("http://user:pw@host:11434", { restrictHosts: false, allowedHosts: [] }).ok).toBe(
      false,
    );
    expect(validateOllamaBaseUrl("not a url", { restrictHosts: false, allowedHosts: [] }).ok).toBe(false);
  });

  it("requires an allow-list in hosted environments", () => {
    expect(validateOllamaBaseUrl("http://10.0.0.5:11434", { restrictHosts: true, allowedHosts: [] }).ok).toBe(false);
    expect(
      validateOllamaBaseUrl("http://ollama.internal:11434", {
        restrictHosts: true,
        allowedHosts: ["ollama.internal:11434"],
      }).ok,
    ).toBe(true);
  });

  it("normalizes fetch failures and model errors", async () => {
    const failing = new OllamaProvider({
      baseUrl: "http://localhost:11434",
      defaultTimeoutMs: 1000,
      restrictHosts: false,
      allowedHosts: [],
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(failing.listModels()).rejects.toMatchObject({ category: "network" });
    const status = await failing.checkConnection();
    expect(status.available).toBe(false);

    const notFound = new OllamaProvider({
      baseUrl: "http://localhost:11434",
      defaultTimeoutMs: 1000,
      restrictHosts: false,
      allowedHosts: [],
      fetchImpl: async () => new Response('{"error":"model not found"}', { status: 404 }),
    });
    await expect(
      notFound.generateStructured({
        task: "job_analysis",
        modelId: "missing",
        schema: z.object({}),
        jsonSchema: {},
        system: "",
        user: "",
      }),
    ).rejects.toMatchObject({ category: "model_incompatible" });
  });

  it("parses structured chat responses", async () => {
    const provider = new OllamaProvider({
      baseUrl: "http://localhost:11434",
      defaultTimeoutMs: 1000,
      restrictHosts: false,
      allowedHosts: [],
      fetchImpl: async () =>
        new Response(JSON.stringify({ model: "llama3.1", message: { content: '{"ok":true}' }, done_reason: "stop" })),
    });
    const result = await provider.generateStructured({
      task: "job_analysis",
      modelId: "llama3.1",
      schema: z.object({ ok: z.boolean() }),
      jsonSchema: {},
      system: "",
      user: "",
    });
    expect(result.data).toEqual({ ok: true });
    expect(result.modelId).toBe("llama3.1");
  });
});

describe("error normalization", () => {
  it("passes through normalized errors and maps unknown errors", () => {
    const original = new AIProviderError("openai", "auth", "bad key");
    expect(normalizeOpenAIError(original)).toBe(original);
    expect(normalizeOpenAIError(new Error("boom")).category).toBe("unknown");
    expect(normalizeAnthropicError(new Error("boom")).category).toBe("unknown");
  });
});
