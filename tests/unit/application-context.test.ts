import { describe, expect, it } from "vitest";
import {
  buildApplicationContext,
  extractApplicationContext,
  isVerbatim,
} from "@/features/job-analysis/application-context";
import { jobAnalysisSchema } from "@/features/job-analysis/schema";
import { PARTLY, POLARSTEPS, POSTING_WITH_LOGISTICS, SEAMFLOW } from "../fixtures/application-cases";

describe("application requirements, office/relocation and eligibility", () => {
  it("surfaces a requested project note", () => {
    const context = extractApplicationContext(SEAMFLOW.text);
    expect(context.applicationRequirements).toEqual([
      {
        id: "apply_1",
        kind: "project_note",
        description: "Send your CV with a short note about the hardest thing you have built.",
        supportingText: "Send your CV with a short note about the hardest thing you have built.",
      },
    ]);
  });

  it("separates stated office and relocation requirements from application requirements", () => {
    const context = extractApplicationContext(POSTING_WITH_LOGISTICS);
    expect(context.logistics.map((item) => [item.kind, item.supportingText])).toEqual([
      ["office", "This is a hybrid role: three days a week in our Lisbon office."],
      ["relocation", "We offer relocation support for candidates moving to Portugal."],
    ]);
    expect(context.applicationRequirements.map((item) => item.kind)).toEqual(["cover_letter", "portfolio"]);
    expect(context.applicationRequirements[0].supportingText).toBe(
      "Please include a link to your portfolio and a cover letter.",
    );
  });

  it("reports eligibility only when the posting states it", () => {
    const stated = extractApplicationContext(POSTING_WITH_LOGISTICS);
    expect(stated.eligibility).toEqual({
      status: "stated",
      statements: ["You must already have the right to work in the EU; we cannot sponsor visas."],
    });
    for (const posting of [PARTLY, POLARSTEPS, SEAMFLOW]) {
      const context = extractApplicationContext(posting.text);
      expect(context.eligibility).toEqual({ status: "unknown", statements: [] });
      expect(context.logistics).toEqual([]);
    }
  });

  it("does not read a requirement into ordinary sentences", () => {
    const context = extractApplicationContext(
      "We are a remote-friendly company with a portfolio of products.\nYou will build features for our customers.",
    );
    expect(context.applicationRequirements).toEqual([]);
    expect(context.eligibility.status).toBe("unknown");
  });

  it("keeps model-extracted items only when they quote the posting", () => {
    const analysis = jobAnalysisSchema.parse({
      applicationRequirements: [
        {
          id: "a1",
          kind: "application_question",
          description: "Explain why you want to join",
          supportingText: "Tell us in two sentences why Seamflow.",
        },
        {
          id: "a2",
          kind: "portfolio",
          description: "Portfolio required",
          supportingText: "A portfolio of shipped interfaces is mandatory.",
        },
      ],
      logistics: [
        {
          id: "l1",
          kind: "relocation",
          description: "Must relocate",
          supportingText: "Relocation to Berlin is required.",
        },
      ],
    });
    const text = `${SEAMFLOW.text}\nTell us in two sentences why Seamflow.`;
    const context = buildApplicationContext(text, analysis);
    expect(context.applicationRequirements.map((item) => item.id)).toEqual(["apply_1", "a1"]);
    expect(context.logistics).toEqual([]);
    expect(context.eligibility.status).toBe("unknown");
  });

  it("matches quotes regardless of case, spacing and quote style", () => {
    expect(isVerbatim("Send your  CV with a short note.", "send your cv with a SHORT note")).toBe(true);
    expect(isVerbatim("Send your CV.", "Send a portfolio")).toBe(false);
    expect(isVerbatim("anything", "short")).toBe(false);
  });
});
