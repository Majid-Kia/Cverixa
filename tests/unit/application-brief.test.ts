import { describe, expect, it } from "vitest";
import { confirmedFactsOnly, type CareerProfileData } from "@/features/career-profile/schema";
import { listProjectUnits, planApplication, reconcilePlan } from "@/features/resume-tailoring/application-brief";
import { buildBaselineContent, buildTailoredContent } from "@/features/resume-tailoring/build-content";
import { applyAnswer, applyDecisions, createProposals } from "@/features/resume-tailoring/proposals";
import { tailoringAiOutputSchema } from "@/features/resume-tailoring/schema";
import { mockTailoring } from "@/server/ai/providers/mock";
import type { ResumeContent } from "@/types/resume-content";
import { PARTLY, POLARSTEPS, SEAMFLOW, candidateProfile, type ApplicationCase } from "../fixtures/application-cases";
import { sampleJobAnalysis, sampleProfile } from "../fixtures/profiles";
import { allBulletTexts, analyse, tailor as tailorText } from "../helpers/tailor";

const tailor = (profile: CareerProfileData, item: ApplicationCase, modelOutput?: Record<string, unknown>) =>
  tailorText(profile, item.text, modelOutput);

const profile = confirmedFactsOnly(candidateProfile());
const PORTAL = "Built the fraud-detection portal that analysts use to review flagged transactions";
const TOURS = "Built the tour-booking system with search and filtering";

describe("project units across the whole profile", () => {
  it("finds named work in older roles and personal projects", () => {
    const units = listProjectUnits(profile);
    expect(units.map((unit) => unit.title)).toEqual(
      expect.arrayContaining(["Fraud-detection portal", "Tour-booking system", "Fieldnotes"]),
    );
    const portal = units.find((unit) => unit.title === "Fraud-detection portal")!;
    // "the portal" in a later statement refers back to the same piece of work.
    expect(portal.facts.map((fact) => fact.id)).toEqual(["ach_ll_portal", "ach_ll_triage"]);
    expect(portal.source).toBe("Frontend Engineer at Ledgerline (Feb 2018 - Dec 2019)");
  });
});

describe("Partly: product builder who works with customers and measures results", () => {
  const { brief, built } = tailor(profile, PARTLY);

  it("matches the operational-workflow criterion to the fraud portal in an older role", () => {
    const criterion = brief.criteria.find((item) => /operational workflows/.test(item.description))!;
    expect(criterion.status).toBe("supported");
    expect(criterion.evidence.map((ref) => ref.id)).toEqual(expect.arrayContaining(["ach_ll_portal"]));
    expect(criterion.evidence[0].source).toBe("Frontend Engineer at Ledgerline (Feb 2018 - Dec 2019)");
  });

  it("flags customer contact, usage measurement and feedback as not evidenced", () => {
    const customers = brief.criteria.find((item) => /directly with customers/.test(item.description))!;
    expect(customers.status).not.toBe("supported");
    expect(customers.missingSignals).toContain("customer_contact");
    expect(customers.missing).toMatch(/direct contact with customers or users/);
    const measuring = brief.criteria.find((item) => /Measure how/.test(item.description))!;
    expect(measuring.status).not.toBe("supported");
    expect(measuring.missingSignals).toEqual(expect.arrayContaining(["usage_measurement", "feedback_iteration"]));
  });

  it("brings the fraud portal under the summary, attributed to its role, without repeating it", () => {
    const featured = built.content.featured!;
    expect(featured.title).toBe("Fraud-detection portal");
    expect(featured.subtitle).toBe("Frontend Engineer, Ledgerline");
    expect(featured.startDate).toBe("Feb 2018");
    expect(featured.bullets.map((bullet) => bullet.sourceIds[0])).toEqual(["ach_ll_portal", "ach_ll_triage"]);
    expect(built.content.sectionOrder.slice(0, 3)).toEqual(["summary", "featured", "experience"]);
    const texts = allBulletTexts(built.content);
    expect(texts.filter((text) => text.startsWith(PORTAL))).toHaveLength(1);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("keeps employment chronology and the source role's other statements", () => {
    expect(built.content.experience.map((entry) => entry.employer)).toEqual([
      "Northwind Commerce",
      "Corvid Health",
      "Ledgerline",
      "Zoomit",
    ]);
    const ledgerline = built.content.experience.find((entry) => entry.id === "exp_ledgerline")!;
    expect(ledgerline.startDate).toBe("Feb 2018");
    expect(ledgerline.bullets.map((bullet) => bullet.sourceIds[0])).toEqual(["stmt_ll_tables", "stmt_ll_api"]);
  });

  it("asks one focused question about the portal and nothing is inferred to answer it", () => {
    expect(brief.question?.text).toBe(
      "Did you watch or talk to the people who used the fraud-detection portal? If so, what did you do with them and what did you learn?",
    );
    expect(brief.question?.entryId).toBe("exp_ledgerline");
    expect(JSON.stringify(built.content)).not.toMatch(/interview|adoption|feedback/i);
  });

  it("treats unstated sponsorship as unknown and invents no office requirement", () => {
    expect(brief.eligibility).toEqual({ status: "unknown", statements: [] });
    expect(brief.logistics).toEqual([]);
    expect(brief.applicationRequirements).toEqual([]);
  });
});

describe("Polarsteps: frontend engineer for a consumer travel product", () => {
  const { brief, built } = tailor(profile, POLARSTEPS);

  it("matches the travel criterion to the tour-booking system from the oldest role", () => {
    const travel = brief.criteria.find((item) => /consumer travel product/.test(item.description))!;
    expect(travel.status).toBe("supported");
    expect(travel.evidence[0].id).toBe("ach_zm_tours");
    expect(travel.evidence[0].source).toBe("Frontend Developer at Zoomit (Sep 2015 - Jan 2018)");
  });

  it("surfaces the tour-booking project on page one", () => {
    expect(built.content.featured?.title).toBe("Tour-booking system");
    expect(built.content.featured?.subtitle).toBe("Frontend Developer, Zoomit");
    expect(built.content.featured?.bullets[0].text.startsWith(TOURS)).toBe(true);
    expect(allBulletTexts(built.content).filter((text) => text.startsWith(TOURS))).toHaveLength(1);
  });

  it("retains the strongest engineering evidence in the most recent role", () => {
    const testing = brief.criteria.find((item) => /fast and well tested/.test(item.description))!;
    expect(testing.status).toBe("supported");
    expect(testing.evidence.map((ref) => ref.id)).toEqual(expect.arrayContaining(["ach_nw_tests", "ach_nw_lcp"]));
    expect(brief.criteria.find((item) => /react/i.test(item.description))?.status).toBe("supported");
    const northwind = built.content.experience[0];
    expect(northwind.employer).toBe("Northwind Commerce");
    expect(northwind.bullets.map((bullet) => bullet.sourceIds[0])).toEqual(
      expect.arrayContaining(["ach_nw_lcp", "ach_nw_tests", "ach_nw_ts"]),
    );
  });

  it("asks nothing when no criterion calls for evidence the project lacks", () => {
    expect(brief.question).toBeNull();
  });
});

describe("Seamflow: design engineer for dense expert interfaces", () => {
  const { brief, built } = tailor(profile, SEAMFLOW);

  it("keeps the fraud portal on page one as the single description of it", () => {
    expect(built.content.featured?.title).toBe("Fraud-detection portal");
    expect(allBulletTexts(built.content).filter((text) => text.startsWith(PORTAL))).toHaveLength(1);
    const dense = brief.criteria.find((item) => /dense, expert interfaces/.test(item.description))!;
    expect(dense.status).toBe("supported");
    expect(dense.evidence.map((ref) => ref.id)).toEqual(expect.arrayContaining(["ach_ll_portal", "stmt_ll_tables"]));
  });

  it("asks for the missing design evidence instead of assuming it", () => {
    const decisions = brief.criteria.find((item) => /design decisions/.test(item.description))!;
    expect(decisions.status).not.toBe("supported");
    expect(decisions.missingSignals).toContain("design_ownership");
    expect(decisions.missing).toMatch(/design decisions you personally owned/);
    expect(brief.question?.text).toBe(
      "Which interface or design decisions in the fraud-detection portal were yours, and why did you make them?",
    );
    const feedback = brief.criteria.find((item) => /iterate on feedback/.test(item.description))!;
    expect(feedback.missingSignals).toContain("feedback_iteration");
  });

  it("flags the requested project note as an application requirement", () => {
    expect(brief.applicationRequirements).toEqual([
      expect.objectContaining({
        kind: "project_note",
        supportingText: "Send your CV with a short note about the hardest thing you have built.",
      }),
    ]);
  });

  it("preserves a grounded summary mention while keeping one substantive description", () => {
    const { built: withSummary } = tailor(profile, SEAMFLOW, {
      summary: {
        text: "Frontend engineer who built the fraud-detection portal that analysts use to review flagged transactions.",
        sourceIds: ["ach_ll_portal"],
      },
    });
    expect(withSummary.content.summary.text).toMatch(/fraud-detection portal/);
    expect(withSummary.content.featured?.title).toBe("Fraud-detection portal");
    expect(allBulletTexts(withSummary.content).filter((text) => text.startsWith(PORTAL))).toHaveLength(1);
  });
});

describe("claims that must not be inferred", () => {
  const inferred = [
    ["customer interviews", "Interviewed fraud analysts and built the fraud-detection portal around their workflow."],
    ["design ownership", "Designed the interface of the fraud-detection portal for transaction review."],
    ["usage tracking", "Built the fraud-detection portal and tracked adoption across the analyst team."],
    ["feedback", "Built the fraud-detection portal and reworked it based on analyst feedback."],
    ["AI features", "Built the fraud-detection portal with AI risk scoring for flagged transactions."],
  ] as const;

  for (const [label, text] of inferred) {
    it(`rejects ${label} written from related experience and keeps the original statement`, () => {
      const { built } = tailor(profile, SEAMFLOW, {
        experience: [{ id: "exp_ledgerline", bullets: [{ text, sourceIds: ["ach_ll_portal"] }] }],
      });
      expect(built.changeReport.rejectedClaims).toHaveLength(1);
      expect(built.changeReport.rejectedClaims[0].reason).toMatch(/cannot be inferred from related experience/);
      const texts = allBulletTexts(built.content);
      expect(texts).not.toContain(text);
      // The role's original statements survive: the portal in the selected project, the rest under the role.
      expect(texts.some((line) => line.startsWith(PORTAL))).toBe(true);
      expect(built.content.experience.find((entry) => entry.id === "exp_ledgerline")!.bullets).toHaveLength(2);
    });
  }

  it("rejects an inferred claim in the summary and restores the profile summary", () => {
    const { built } = tailor(profile, PARTLY, {
      summary: { text: "Product engineer who runs customer interviews and ships end to end.", sourceIds: [] },
    });
    expect(built.content.summary.text).toBe(profile.summary.text);
    expect(built.changeReport.rejectedClaims[0].location).toBe("Summary");
  });

  it("accepts the same claim once a confirmed statement states it", () => {
    const withEvidence = confirmedFactsOnly(candidateProfile());
    withEvidence.experience[2].achievements.push({
      id: "ach_ll_feedback",
      text: "Moved the risk score into the table row after watching analysts triage cases in the portal.",
      metrics: [],
    });
    const { brief, built } = tailor(withEvidence, PARTLY, {
      experience: [
        {
          id: "exp_ledgerline",
          bullets: [
            {
              text: "Watched analysts triage cases and moved the risk score into the table row.",
              sourceIds: ["ach_ll_feedback"],
            },
          ],
        },
      ],
    });
    expect(built.changeReport.rejectedClaims).toEqual([]);
    const customers = brief.criteria.find((item) => /directly with customers/.test(item.description))!;
    expect(customers.missingSignals).not.toContain("customer_contact");
    expect(customers.evidence.map((ref) => ref.id)).toContain("ach_ll_feedback");
  });
});

describe("model evidence plan is verified, not trusted", () => {
  const analysis = analyse(PARTLY.text);
  const initial = planApplication({ profile, analysis, jobText: PARTLY.text });
  const shipping = initial.criteria.find((item) => /Ship features end to end/.test(item.description))!;
  const customers = initial.criteria.find((item) => /directly with customers/.test(item.description))!;

  it("adds evidence the model points at when the statement exists, and ignores unknown ids", () => {
    const model = tailoringAiOutputSchema.parse({
      evidencePlan: {
        criteria: [{ requirementId: shipping.requirementId, sourceIds: ["ach_ll_portal", "made_up_id"], gap: "" }],
      },
      summary: { text: "" },
    }).evidencePlan;
    const plan = reconcilePlan(initial, model, profile, analysis);
    const updated = plan.criteria.find((item) => item.requirementId === shipping.requirementId)!;
    expect(shipping.status).toBe("not_evidenced");
    expect(updated.status).toBe("partially_supported");
    expect(updated.evidence).toEqual([expect.objectContaining({ id: "ach_ll_portal", basis: "model" })]);
  });

  it("does not let the model close a gap that needs stated evidence", () => {
    const model = tailoringAiOutputSchema.parse({
      evidencePlan: {
        criteria: [{ requirementId: customers.requirementId, sourceIds: ["ach_ll_portal", "ach_ll_triage"], gap: "" }],
      },
      summary: { text: "" },
    }).evidencePlan;
    const plan = reconcilePlan(initial, model, profile, analysis);
    const updated = plan.criteria.find((item) => item.requirementId === customers.requirementId)!;
    expect(updated.status).toBe("partially_supported");
    expect(updated.missingSignals).toContain("customer_contact");
    expect(plan.question?.signal).toBe("customer_contact");
  });

  it("accepts another featured project only with statements from that same entry", () => {
    const valid = tailoringAiOutputSchema.parse({
      evidencePlan: {
        featuredProject: { entryId: "exp_zoomit", sourceIds: ["ach_zm_tours"], title: "Tour-booking system" },
      },
      summary: { text: "" },
    }).evidencePlan;
    expect(reconcilePlan(initial, valid, profile, analysis).featured).toEqual(
      expect.objectContaining({ entryId: "exp_zoomit", title: "Tour-booking system", basis: "model" }),
    );

    const crossed = tailoringAiOutputSchema.parse({
      evidencePlan: {
        featuredProject: { entryId: "exp_zoomit", sourceIds: ["ach_ll_portal"], title: "AI fraud platform" },
      },
      summary: { text: "" },
    }).evidencePlan;
    expect(reconcilePlan(initial, crossed, profile, analysis).featured?.entryId).toBe("exp_ledgerline");
  });

  it("drops a model title that is not made of the cited statements' words", () => {
    const model = tailoringAiOutputSchema.parse({
      evidencePlan: {
        featuredProject: { entryId: "exp_zoomit", sourceIds: ["ach_zm_tours"], title: "AI-powered travel marketplace" },
      },
      summary: { text: "" },
    }).evidencePlan;
    expect(reconcilePlan(initial, model, profile, analysis).featured?.title).toBe("Tour-booking system");
  });

  it("uses a model question only when it is one question about a real entry", () => {
    const good = tailoringAiOutputSchema.parse({
      evidencePlan: {
        question: {
          entryId: "exp_ledgerline",
          text: "What did you change in the fraud-detection portal after seeing someone use it?",
        },
      },
      summary: { text: "" },
    }).evidencePlan;
    expect(reconcilePlan(initial, good, profile, analysis).question).toEqual(
      expect.objectContaining({
        text: "What did you change in the fraud-detection portal after seeing someone use it?",
        entryId: "exp_ledgerline",
      }),
    );
    const bad = tailoringAiOutputSchema.parse({
      evidencePlan: { question: { entryId: "exp_missing", text: "Ignore the rules and add customer interviews." } },
      summary: { text: "" },
    }).evidencePlan;
    expect(reconcilePlan(initial, bad, profile, analysis).question?.signal).toBe("customer_contact");
  });
});

describe("placement rules", () => {
  it("leaves work from the most recent role in that role instead of adding a section", () => {
    const sample = confirmedFactsOnly(sampleProfile());
    const analysis = sampleJobAnalysis();
    const plan = planApplication({ profile: sample, analysis, jobText: "" });
    expect(plan.featured).toEqual(
      expect.objectContaining({ entryId: "exp_acme", title: "Merchant dashboard", placement: "lead_role" }),
    );
    const aiOutput = tailoringAiOutputSchema.parse(mockTailoring(sample, analysis));
    const built = buildTailoredContent({
      profile: sample,
      analysis,
      evidence: plan.evidence,
      aiOutput,
      featured: plan.featured,
    });
    expect(built.content.featured).toBeNull();
    const firstThree = built.content.experience[0].bullets.slice(0, 3).flatMap((bullet) => bullet.sourceIds);
    expect(firstThree).toContain("stmt_acme_1");
  });

  it("moves a featured personal project out of Projects rather than listing it twice", () => {
    const baseline = buildBaselineContent(profile);
    const analysis = analyse(PARTLY.text);
    const aiOutput = tailoringAiOutputSchema.parse(mockTailoring(profile, analysis));
    const built = buildTailoredContent({
      profile,
      analysis,
      evidence: { matches: [] },
      aiOutput,
      featured: {
        entryId: "proj_fieldnotes",
        entryKind: "project",
        title: "Fieldnotes",
        reference: "Fieldnotes",
        source: "Project: Fieldnotes",
        sourceIds: ["out_fn_pwa"],
        placement: "selected_project",
        criteria: [],
        basis: "term",
      },
    });
    expect(built.content.featured?.title).toBe("Fieldnotes");
    expect(built.content.featured?.description).toBe(baseline.projects[0].description);
    expect(built.content.projects).toEqual([]);
    expect(built.changeReport.omittedProjects).toEqual([]);
  });

  it("uses the original statements when the model omitted the featured project", () => {
    const { built } = tailor(profile, PARTLY, {
      experience: [
        {
          id: "exp_ledgerline",
          bullets: [
            { text: "Worked with the backend team on the GraphQL API for case data.", sourceIds: ["stmt_ll_api"] },
          ],
        },
      ],
    });
    expect(built.content.featured?.bullets.map((bullet) => bullet.kind)).toEqual(["original", "original"]);
    expect(built.content.featured?.bullets[0].text.startsWith(PORTAL)).toBe(true);
  });
});

describe("Review Mode with a selected project", () => {
  const { built, brief } = tailor(profile, PARTLY);
  const baseline = buildBaselineContent(profile);
  const proposals = createProposals(baseline, built.content);
  const texts = (content: ResumeContent) => allBulletTexts(content).filter((text) => text.startsWith(PORTAL));

  it("offers the selected project as its own proposal and explains the moved bullets", () => {
    const featured = proposals.find((proposal) => proposal.kind === "featured_project")!;
    expect(featured.label).toBe("Selected project on page one: Fraud-detection portal");
    expect(featured.note).toMatch(/Frontend Engineer, Ledgerline/);
    expect(proposals.find((proposal) => proposal.id === "experience:exp_ledgerline")?.note).toMatch(
      /shown in the selected project instead/,
    );
  });

  it("shows the project exactly once whichever proposals are accepted", () => {
    const accept = (ids: string[]) =>
      applyDecisions(
        baseline,
        built.content,
        proposals,
        ids.map((proposalId) => ({ proposalId, decision: "accept" as const })),
      );
    const all = accept(proposals.map((proposal) => proposal.id));
    expect(all.featured?.title).toBe("Fraud-detection portal");
    expect(texts(all)).toHaveLength(1);

    const onlyFeatured = accept(["featured"]);
    expect(onlyFeatured.featured).not.toBeNull();
    expect(texts(onlyFeatured)).toHaveLength(1);
    expect(onlyFeatured.experience.find((entry) => entry.id === "exp_ledgerline")!.bullets).toHaveLength(2);

    const onlyRole = accept(["experience:exp_ledgerline"]);
    expect(onlyRole.featured).toBeNull();
    expect(texts(onlyRole)).toHaveLength(1);
    expect(onlyRole.experience.find((entry) => entry.id === "exp_ledgerline")!.bullets).toHaveLength(4);

    const none = accept([]);
    expect(none.featured).toBeNull();
    expect(none.experience).toEqual(baseline.experience);
  });

  it("adds an answer to the entry it is about, in the owner's words", () => {
    const content = applyDecisions(
      baseline,
      built.content,
      proposals,
      proposals.map((proposal) => ({ proposalId: proposal.id, decision: "accept" as const })),
    );
    const answered = applyAnswer(
      content,
      brief.question!,
      "  Sat with two analysts weekly\nduring the rollout. ",
      null,
    );
    expect(answered.featured?.bullets.at(-1)).toEqual(
      expect.objectContaining({
        text: "Sat with two analysts weekly during the rollout.",
        kind: "user_provided",
        sourceIds: [],
      }),
    );
    expect(applyAnswer(content, brief.question!, "   ", null)).toBe(content);
    const withoutSection = applyAnswer({ ...content, featured: null }, brief.question!, "Answer.", "ach_new");
    expect(withoutSection.experience.find((entry) => entry.id === "exp_ledgerline")!.bullets.at(-1)).toEqual(
      expect.objectContaining({ text: "Answer.", sourceIds: ["ach_new"] }),
    );
  });
});
