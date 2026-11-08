import { describe, expect, it } from "vitest";
import { matchEvidence, missingRequirementSummaries, significantWords } from "@/features/resume-tailoring/evidence";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { sampleJobAnalysis, sampleProfile } from "../fixtures/profiles";

describe("matchEvidence (Stage 2)", () => {
  const profile = confirmedFactsOnly(sampleProfile());
  const evidence = matchEvidence(profile, sampleJobAnalysis());
  const byId = (id: string) => evidence.matches.find((match) => match.requirementId === id)!;

  it("marks requirements with matching confirmed skills as supported", () => {
    expect(byId("req_react").status).toBe("supported");
    expect(byId("req_react").evidence.some((ref) => ref.kind === "skill" && ref.label === "React")).toBe(true);
  });

  it("finds responsibility evidence through description words", () => {
    expect(byId("req_arch").status).not.toBe("not_evidenced");
    expect(byId("req_arch").evidence.some((ref) => ref.id === "stmt_acme_1")).toBe(true);
  });

  it("matches leadership requirements against statements", () => {
    expect(byId("req_lead").status).not.toBe("not_evidenced");
    expect(byId("req_lead").evidence.some((ref) => ref.id === "stmt_acme_2")).toBe(true);
  });

  it("does not use unconfirmed (imported) skills as evidence", () => {
    expect(byId("req_k8s").status).toBe("not_evidenced");
    expect(byId("req_k8s").missing).toMatch(/kubernetes/i);
  });

  it("reports unsupported requirements with their classification", () => {
    const missing = missingRequirementSummaries(evidence);
    expect(missing.some((line) => line.startsWith("[Mandatory]") && /Kubernetes/.test(line))).toBe(true);
    expect(missing.some((line) => /Java/.test(line))).toBe(true);
  });

  it("extracts significant words", () => {
    expect(significantWords("Strong experience with frontend architecture")).toEqual(["frontend", "architecture"]);
  });
});
