import { describe, expect, it } from "vitest";
import {
  classifyVisaSupport,
  mergeAiSignals,
  readSponsorshipSentence,
  type AiVisaSignals,
} from "@/features/job-scanner/sponsorship";

const URL = "https://example.com/jobs/1";
const classify = (text: string, flag = false) =>
  classifyVisaSupport(text, { sourceUrl: URL, sourceFlag: flag ? { label: "Arbeitnow" } : null });

const noSignals: AiVisaSignals = {
  sponsorship: { status: "unknown", quotes: [] },
  relocation: { offered: false, quotes: [] },
  workAuthorization: { required: false, quotes: [] },
};

describe("sponsorship classification", () => {
  it("confirms sponsorship only from an explicit offer, with the sentence as evidence (scenario 4)", () => {
    const result = classify(`About the role
We are hiring a Senior Frontend Engineer in Berlin.
We offer visa sponsorship and a relocation package for candidates moving to Germany.`);
    expect(result.sponsorship.status).toBe("confirmed");
    expect(result.sponsorship.evidence[0]).toMatchObject({
      basis: "posting_text",
      reading: "offers",
      sourceUrl: URL,
    });
    expect(result.sponsorship.evidence[0].text).toContain("We offer visa sponsorship");
    expect(result.relocation.status).toBe("offered");
  });

  it.each([
    "Visa sponsorship is available for this role.",
    "We sponsor work permits for international hires.",
    "Our people team will support you with your work permit and Blue Card application.",
    "- Visa sponsorship",
    "- Relocation and visa support",
    "Wir bieten Visa-Sponsoring und Unterstützung beim Umzug.",
  ])("reads %j as an offer", (sentence) => {
    expect(classify(sentence).sponsorship.status).toBe("confirmed");
  });

  it("leaves a posting without sponsorship information unknown (scenario 5)", () => {
    const result = classify(`Senior Frontend Engineer
You will build our React design system and mentor other engineers.
Requirements: 5+ years of TypeScript. Benefits: 30 days of holiday and a learning budget.`);
    expect(result.sponsorship.status).toBe("unknown");
    expect(result.sponsorship.evidence).toEqual([]);
    expect(result.relocation.status).toBe("unknown");
    expect(result.workAuthorization.required).toBe(false);
  });

  it.each([
    "We are unable to sponsor visas for this position.",
    "Unfortunately we cannot offer visa sponsorship at this time.",
    "This role is not eligible for visa sponsorship.",
    "Please note: no visa sponsorship is available.",
    "Sponsorship is not available for this role.",
    "We do not provide sponsorship for work permits.",
  ])("reads %j as an exclusion", (sentence) => {
    expect(classify(sentence).sponsorship.status).toBe("none");
  });

  it.each([
    "Visa sponsorship may be available for exceptional candidates.",
    "Sponsorship can be considered on a case-by-case basis.",
    "Do you require visa sponsorship to work in the Netherlands?",
    "Please let us know if you will need a visa.",
    "Tell us about your visa status in your application.",
  ])("reads %j as possible, never confirmed", (sentence) => {
    expect(classify(sentence).sponsorship.status).toBe("possible");
  });

  it("does not mistake the Visa card network for an immigration visa", () => {
    expect(readSponsorshipSentence("We support Visa, Mastercard and American Express payments.")).toBeNull();
    expect(classify("We offer integrations with Visa and Mastercard card schemes.").sponsorship.status).toBe("unknown");
  });

  it("treats a job-board sponsorship flag as possible, not confirmed", () => {
    const result = classify("Build our web application with React.", true);
    expect(result.sponsorship.status).toBe("possible");
    expect(result.sponsorship.evidence[0]).toMatchObject({ basis: "source_flag", reading: "uncertain" });
  });

  it("treats relocation support alone as possible, with the basis stated", () => {
    const result = classify("We offer a generous relocation package.");
    expect(result.relocation.status).toBe("offered");
    expect(result.sponsorship.status).toBe("possible");
    expect(result.sponsorship.evidence[0].basis).toBe("relocation_signal");
  });

  it("does not read the applicant's willingness to relocate as relocation support", () => {
    const result = classify("You must be willing to relocate to Munich.");
    expect(result.relocation.status).toBe("unknown");
    expect(result.sponsorship.status).toBe("unknown");
  });

  it("flags postings that require existing work authorisation", () => {
    const result = classify("Applicants must have the right to work in the UK. We are unable to sponsor visas.");
    expect(result.workAuthorization.required).toBe(true);
    expect(result.sponsorship.status).toBe("none");
    const implied = classify("You must be authorized to work in the United States without sponsorship.");
    expect(implied.workAuthorization.required).toBe(true);
    expect(implied.sponsorship.status).toBe("none");
    const only = classify("A valid work permit for Germany is required.");
    expect(only.workAuthorization.required).toBe(true);
    expect(only.sponsorship.status).toBe("unknown");
  });

  it("reports conflicting statements as possible with both sentences", () => {
    const result = classify(
      "We offer visa sponsorship for engineering roles. Contractors: we cannot sponsor visas for contract positions.",
    );
    expect(result.sponsorship.status).toBe("possible");
    expect(result.sponsorship.evidence.map((item) => item.reading).sort()).toEqual(["excludes", "offers"]);
  });
});

describe("AI signals", () => {
  const text = `Senior Frontend Engineer
Moving to Amsterdam? Our mobility team runs the highly skilled migrant process for you from start to finish.
Sponsorship may be possible for exceptional candidates in other offices.`;

  it("accepts a confirmation only with a verbatim, unhedged quote from the posting", () => {
    const base = classify(text);
    expect(base.sponsorship.status).toBe("possible");
    const merged = mergeAiSignals(
      base,
      {
        ...noSignals,
        sponsorship: {
          status: "confirmed",
          quotes: ["Our mobility team runs the highly skilled migrant process for you from start to finish."],
        },
      },
      text,
      URL,
    );
    expect(merged.sponsorship.status).toBe("confirmed");
    expect(merged.sponsorship.evidence.some((item) => item.basis === "ai_quote" && item.reading === "offers")).toBe(
      true,
    );
  });

  it("ignores a confirmation whose quote is not in the posting", () => {
    const base = classify("Build our React application.");
    const merged = mergeAiSignals(
      base,
      { ...noSignals, sponsorship: { status: "confirmed", quotes: ["We offer visa sponsorship."] } },
      "Build our React application.",
      URL,
    );
    expect(merged.sponsorship.status).toBe("unknown");
    expect(merged.sponsorship.evidence).toEqual([]);
  });

  it("does not let a hedged quote or an injected claim confirm sponsorship", () => {
    const hedged = "Sponsorship may be possible for exceptional candidates in other offices.";
    const base = classify(hedged);
    const merged = mergeAiSignals(
      base,
      { ...noSignals, sponsorship: { status: "confirmed", quotes: [hedged] } },
      hedged,
      URL,
    );
    expect(merged.sponsorship.status).toBe("possible");
  });

  it("never overrides an explicit exclusion", () => {
    const posting = "We are unable to sponsor visas. Relocation support is provided within the EU.";
    const base = classify(posting);
    expect(base.sponsorship.status).toBe("none");
    const merged = mergeAiSignals(
      base,
      { ...noSignals, sponsorship: { status: "confirmed", quotes: ["We are unable to sponsor visas."] } },
      posting,
      URL,
    );
    expect(merged.sponsorship.status).toBe("none");
  });
});
