import { Badge, Card, CardTitle } from "@/components/ui/card";
import type { ApplicationBrief, BriefCriterion, RequirementMatch } from "./schema";

const STATUS: Record<RequirementMatch["status"], { label: string; tone: "success" | "warning" | "danger" }> = {
  supported: { label: "Supported", tone: "success" },
  partially_supported: { label: "Partly supported", tone: "warning" },
  not_evidenced: { label: "No evidence", tone: "danger" },
};

const REQUIREMENT_KIND: Record<ApplicationBrief["applicationRequirements"][number]["kind"], string> = {
  project_note: "Project note",
  portfolio: "Portfolio",
  cover_letter: "Cover letter",
  application_question: "Application question",
  other: "Other",
};

function Criterion({ criterion }: { criterion: BriefCriterion }) {
  const status = STATUS[criterion.status];
  return (
    <li>
      <p>
        <Badge tone={status.tone}>{status.label}</Badge>{" "}
        {criterion.classification === "mandatory" ? <span className="font-medium">[Mandatory] </span> : null}
        {criterion.description}
      </p>
      {criterion.evidence.length > 0 ? (
        <ul className="text-muted mt-1 list-disc space-y-0.5 pl-5 text-xs">
          {criterion.evidence.slice(0, 3).map((ref) => (
            <li key={`${ref.kind}-${ref.id}`}>
              {ref.label}
              {ref.source && ref.source !== ref.label ? <span> · {ref.source}</span> : null}
              {ref.basis === "model" ? <span> · matched by AI, source verified</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {criterion.missing ? <p className="mt-1 text-xs text-amber-800">Still missing: {criterion.missing}</p> : null}
    </li>
  );
}

/**
 * Screening criteria with the evidence found for each across the whole
 * profile, and what is still not evidenced. Worked out before drafting.
 */
export function ScreeningCriteriaCard({ brief }: { brief: ApplicationBrief }) {
  const featured = brief.featured;
  return (
    <Card>
      <CardTitle>Screening criteria and evidence</CardTitle>
      <p className="text-muted mb-3 text-xs">
        What this role is likely to screen on, matched against every role and project in your confirmed profile before
        drafting. Related experience is never counted as proof of customer contact, design ownership, usage tracking or
        AI work.
      </p>
      {brief.criteria.length === 0 ? (
        <p className="text-muted text-sm">The job analysis did not yield screening criteria.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {brief.criteria.map((criterion) => (
            <Criterion key={criterion.requirementId} criterion={criterion} />
          ))}
        </ul>
      )}
      {featured ? (
        <div className="border-border mt-4 border-t pt-3 text-sm">
          <p className="font-medium">
            {featured.placement === "selected_project" ? "Brought onto page one: " : "Kept at the top of page one: "}
            {featured.title || featured.source}
          </p>
          <p className="text-muted mt-1 text-xs">
            From {featured.source}.{" "}
            {featured.placement === "selected_project"
              ? "Shown as a short selected-project entry under the summary; its bullets are moved there, not repeated."
              : "It belongs to your most recent role, so it stays in that role's first bullets."}
            {featured.basis === "model" ? " Chosen by the AI; the cited statements were verified." : ""}
          </p>
          {featured.criteria.length > 0 ? (
            <p className="text-muted mt-1 text-xs">Speaks to: {featured.criteria.join("; ")}</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * What the posting asks the applicant to do beyond the resume, plus stated
 * office and relocation requirements and whether sponsorship or eligibility is
 * mentioned at all. Quoted from the posting for the owner to check.
 */
export function ApplicationChecklistCard({ brief }: { brief: ApplicationBrief }) {
  return (
    <Card>
      <CardTitle>What the application asks for</CardTitle>
      {brief.applicationRequirements.length === 0 ? (
        <p className="text-muted text-sm">The posting does not ask for anything beyond a resume.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {brief.applicationRequirements.map((item) => (
            <li key={item.id}>
              <Badge tone="info">{REQUIREMENT_KIND[item.kind]}</Badge> &ldquo;{item.supportingText || item.description}
              &rdquo;
            </li>
          ))}
        </ul>
      )}
      {brief.applicationRequirements.length > 0 ? (
        <p className="text-muted mt-2 text-xs">These are not part of the resume. Prepare them separately.</p>
      ) : null}

      <h3 className="mt-5 mb-2 text-sm font-semibold">Office and relocation</h3>
      {brief.logistics.length === 0 ? (
        <p className="text-muted text-sm">No office-attendance or relocation requirement is stated.</p>
      ) : (
        <>
          <ul className="space-y-2 text-sm">
            {brief.logistics.map((item) => (
              <li key={item.id}>
                <Badge tone="warning">{item.kind === "relocation" ? "Relocation" : "Office"}</Badge> &ldquo;
                {item.supportingText || item.description}&rdquo;
              </li>
            ))}
          </ul>
          <p className="text-muted mt-2 text-xs">Check these against your own circumstances before applying.</p>
        </>
      )}

      <h3 className="mt-5 mb-2 text-sm font-semibold">Sponsorship and work eligibility</h3>
      {brief.eligibility.status === "stated" ? (
        <ul className="space-y-2 text-sm">
          {brief.eligibility.statements.map((statement, index) => (
            <li key={index}>
              <Badge tone="warning">Stated</Badge> &ldquo;{statement}&rdquo;
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">
          <Badge>Unknown</Badge> The posting says nothing about visa sponsorship or work eligibility. Nothing is assumed
          either way; ask the employer if it matters for you.
        </p>
      )}
    </Card>
  );
}
