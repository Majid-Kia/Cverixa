import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, buttonClasses, LinkButton } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { tailorListingAction } from "@/features/job-scanner/actions";
import {
  LISTING_STATUS_LABELS,
  RELOCATION_LABELS,
  SPONSORSHIP_DESCRIPTIONS,
  WORK_ARRANGEMENT_LABELS,
  type ListingStatus,
} from "@/features/job-scanner/constants";
import { countryName } from "@/features/job-scanner/countries";
import { getListing } from "@/features/job-scanner/listings-service";
import type { Evidence } from "@/features/job-scanner/sponsorship";
import { sourceLabel } from "@/features/job-scanner/sources/registry";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime } from "@/lib/utils";
import { requireUser } from "@/server/security/session";
import { MatchScore, RelocationBadge, SponsorshipBadge } from "../badges";
import { ListingStatusSelect } from "../listing-status-select";
import { AnalyzeListingForm } from "./analyze-listing-form";

export const metadata: Metadata = { title: "Job Listing" };
export const dynamic = "force-dynamic";

const BASIS_LABELS: Record<Evidence["basis"], string> = {
  posting_text: "From the posting",
  ai_quote: "Quoted by AI, verified in the posting",
  source_flag: "Job board flag",
  relocation_signal: "Relocation support (not sponsorship)",
};

const READING_LABELS: Record<Evidence["reading"], { label: string; tone: "success" | "danger" | "info" | "warning" }> =
  {
    offers: { label: "States an offer", tone: "success" },
    excludes: { label: "Rules it out", tone: "danger" },
    uncertain: { label: "Not a commitment", tone: "info" },
    requires_authorization: { label: "Requires authorisation", tone: "warning" },
  };

const EVENT_LABELS: Record<string, string> = {
  discovered: "Discovered",
  status_changed: "Status changed",
  content_updated: "Posting updated",
  tailoring_started: "Resume tailoring started",
  imported: "Imported",
};

function EvidenceList({ items, empty }: { items: Evidence[]; empty: string }) {
  if (items.length === 0) return <p className="text-muted text-sm">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={`${item.basis}-${index}`} className="border-border border-l-2 pl-3">
          <p className="text-sm">&ldquo;{item.text}&rdquo;</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge tone={READING_LABELS[item.reading].tone}>{READING_LABELS[item.reading].label}</Badge>
            <span className="text-muted">{BASIS_LABELS[item.basis]}</span>
            {item.sourceUrl ? (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Source
              </a>
            ) : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;
  let listing;
  try {
    listing = await getListing(user.id, id);
  } catch (caught) {
    if (caught instanceof NotFoundError) notFound();
    throw caught;
  }
  const applyUrl = listing.applyUrl ?? listing.url;

  return (
    <>
      <PageHeader
        title={listing.title}
        description={[
          listing.company,
          listing.countryCode ? countryName(listing.countryCode) : null,
          listing.location,
          WORK_ARRANGEMENT_LABELS[listing.workArrangement],
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <form action={tailorListingAction}>
              <input type="hidden" name="id" value={listing.id} />
              <Button type="submit">Tailor Resume for This Job</Button>
            </form>
            <a href={applyUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary")}>
              Apply on {sourceLabel(listing.sourceId)}
            </a>
            <LinkButton href="/scanner" variant="ghost">
              Back to results
            </LinkButton>
          </>
        }
      />
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <MatchScore score={listing.matchScore} size="lg" />
                <div>
                  <CardTitle className="mb-0">Job Match Score</CardTitle>
                  <p className="text-muted text-xs">
                    Relevance to your confirmed profile, on a documented rubric. Not the probability of an interview.
                  </p>
                </div>
              </div>
              <AnalyzeListingForm listingId={listing.id} analyzed={listing.analysisStatus === "completed"} />
            </div>
            {listing.analysisFailure ? (
              <Alert tone="warning" className="mt-3" title="AI analysis is unavailable for this listing">
                {listing.analysisFailure}
              </Alert>
            ) : null}
            {listing.explanation ? <p className="mt-3 text-sm">{listing.explanation}</p> : null}
            {listing.breakdown ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-border text-muted border-b text-left text-xs tracking-wide uppercase">
                      <th className="py-2 pr-3">Component</th>
                      <th className="py-2 pr-3">Weight</th>
                      <th className="py-2 pr-3">Result</th>
                      <th className="py-2 pr-3">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listing.breakdown.components.map((component) => (
                      <tr key={component.id} className="border-border border-b align-top">
                        <td className="py-2 pr-3">
                          <p className="font-medium">{component.label}</p>
                          <p className="text-muted text-xs">{component.detail}</p>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{component.weight}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {component.value === null ? "Not applicable" : `${Math.round(component.value * 100)}%`}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{component.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-muted mt-2 text-xs">
                  Components that do not apply are left out and the others are rescaled to 100.
                  {listing.analysisProvider
                    ? ` Requirements extracted with ${listing.analysisProvider} on ${formatDateTime(listing.analyzedAt)}; the comparison with your profile is rule-based.`
                    : ""}
                </p>
              </div>
            ) : !listing.analysisFailure ? (
              <p className="text-muted mt-3 text-sm">
                This listing has not been analysed yet. It is analysed during a scan, or on request with the button
                above.
              </p>
            ) : null}
          </Card>

          {listing.breakdown && listing.breakdown.matchingQualifications.length > 0 ? (
            <Card>
              <CardTitle>Matching qualifications</CardTitle>
              <ul className="space-y-3 text-sm">
                {listing.breakdown.matchingQualifications.map((item, index) => (
                  <li key={index}>
                    <p>
                      {item.description}{" "}
                      {item.classification === "mandatory" ? <Badge tone="danger">mandatory</Badge> : null}
                    </p>
                    {item.evidence.length > 0 ? (
                      <p className="text-muted mt-1 text-xs">In your profile: {item.evidence.join("; ")}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {listing.missingQualifications.length > 0 ? (
            <Card>
              <CardTitle>Missing or weakly supported qualifications</CardTitle>
              <ul className="space-y-3 text-sm">
                {listing.missingQualifications.map((item, index) => (
                  <li key={index}>
                    <p>
                      {item.description}{" "}
                      {item.classification === "mandatory" ? <Badge tone="danger">mandatory</Badge> : null}{" "}
                      <Badge tone={item.status === "not_evidenced" ? "danger" : "warning"}>
                        {item.status === "not_evidenced" ? "not in your profile" : "partly supported"}
                      </Badge>
                    </p>
                    {item.note ? <p className="text-muted mt-1 text-xs">{item.note}</p> : null}
                  </li>
                ))}
              </ul>
              <p className="text-muted mt-3 text-xs">
                Only confirmed facts in your Master Career Profile count. If you have this experience, add it to your
                profile; nothing is assumed.
              </p>
            </Card>
          ) : null}

          {listing.requirements.length > 0 ? (
            <Card>
              <CardTitle>Job requirements</CardTitle>
              <ul className="space-y-2 text-sm">
                {listing.requirements.map((requirement, index) => (
                  <li key={index}>
                    <p>
                      {requirement.description}{" "}
                      <Badge tone={requirement.classification === "mandatory" ? "danger" : "neutral"}>
                        {requirement.classification}
                      </Badge>{" "}
                      <span className="text-muted text-xs">{requirement.category.replace(/_/g, " ")}</span>
                    </p>
                    {requirement.supportingText ? (
                      <p className="text-muted mt-1 text-xs">&ldquo;{requirement.supportingText}&rdquo;</p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {listing.breakdown && listing.breakdown.restrictions.length > 0 ? (
                <p className="text-muted mt-3 text-xs">
                  Stated restrictions (not scored): {listing.breakdown.restrictions.join("; ")}
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardTitle>Job description</CardTitle>
            {/* Posting text is untrusted and rendered as plain text only. */}
            <div className="text-sm break-words whitespace-pre-wrap">{listing.description || "No description."}</div>
            <p className="text-muted mt-4 text-xs">
              Text as provided by {sourceLabel(listing.sourceId)}.{" "}
              <a href={listing.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Open the original posting
              </a>
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardTitle>Tracking</CardTitle>
            <div className="flex items-center gap-3">
              <ListingStatusSelect listingId={listing.id} title={listing.title} status={listing.status} />
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-muted text-xs">Source</dt>
                <dd>
                  {sourceLabel(listing.sourceId)}{" "}
                  {listing.ingestion === "manual" ? (
                    <Badge tone="warning">Imported by you</Badge>
                  ) : (
                    <Badge tone="success">Found by a scan</Badge>
                  )}
                </dd>
              </div>
              {listing.alsoSeenOn.length > 0 ? (
                <div>
                  <dt className="text-muted text-xs">Also listed on</dt>
                  <dd>{listing.alsoSeenOn.map((item) => sourceLabel(item.sourceId)).join(", ")}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted text-xs">Published</dt>
                <dd>{listing.postedAt ? formatDateTime(listing.postedAt) : "Not stated by the source"}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Discovered</dt>
                <dd>{formatDateTime(listing.discoveredAt)}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">Last seen at the source</dt>
                <dd>{formatDateTime(listing.lastSeenAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardTitle>Visa sponsorship</CardTitle>
            <div className="mb-2">
              <SponsorshipBadge status={listing.sponsorshipStatus} />
            </div>
            <p className="text-muted mb-3 text-sm">{SPONSORSHIP_DESCRIPTIONS[listing.sponsorshipStatus]}</p>
            <EvidenceList
              items={listing.sponsorshipEvidence}
              empty="The posting contains no statement about visas or sponsorship."
            />
          </Card>

          <Card>
            <CardTitle>Relocation support</CardTitle>
            <div className="mb-3 flex items-center gap-2">
              <RelocationBadge status={listing.relocationStatus} />
              {listing.relocationStatus === "unknown" ? (
                <span className="text-muted text-sm">{RELOCATION_LABELS.unknown}</span>
              ) : null}
            </div>
            <EvidenceList items={listing.relocationEvidence} empty="The posting does not mention relocation support." />
          </Card>

          <Card>
            <CardTitle>Work authorisation</CardTitle>
            {listing.workAuthRequired ? (
              <Badge tone="warning" className="mb-3">
                Existing work authorisation required
              </Badge>
            ) : null}
            <EvidenceList
              items={listing.workAuthEvidence}
              empty="The posting does not state that existing work authorisation is required."
            />
          </Card>

          <Card>
            <CardTitle>Resumes for this job</CardTitle>
            {listing.resumes.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {listing.resumes.map((resume) => (
                  <li key={resume.id} className="flex items-center justify-between gap-2">
                    <Link href={`/resumes/${resume.id}`} className="text-primary font-medium hover:underline">
                      {resume.title}
                    </Link>
                    <span className="text-muted text-xs">{formatDateTime(resume.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-sm">No resume has been tailored for this job yet.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={tailorListingAction}>
                <input type="hidden" name="id" value={listing.id} />
                <Button type="submit" size="sm">
                  Quick Generate
                </Button>
              </form>
              <form action={tailorListingAction}>
                <input type="hidden" name="id" value={listing.id} />
                <input type="hidden" name="mode" value="review" />
                <Button type="submit" size="sm" variant="secondary">
                  Review Mode
                </Button>
              </form>
              {listing.jobDescriptionId ? (
                <LinkButton href={`/jobs/${listing.jobDescriptionId}`} size="sm" variant="ghost">
                  Open job description
                </LinkButton>
              ) : null}
            </div>
            <p className="text-muted mt-2 text-xs">
              Both open the existing Generate Resume page with this posting selected.
            </p>
          </Card>

          <Card>
            <CardTitle>History</CardTitle>
            <ul className="space-y-2 text-sm">
              {listing.events.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3">
                  <span>
                    {EVENT_LABELS[event.type] ?? event.type}
                    {event.type === "status_changed" && event.toStatus
                      ? `: ${LISTING_STATUS_LABELS[event.fromStatus as ListingStatus] ?? event.fromStatus} to ${LISTING_STATUS_LABELS[event.toStatus as ListingStatus] ?? event.toStatus}`
                      : ""}
                    {event.detail ? <span className="text-muted block text-xs">{event.detail}</span> : null}
                  </span>
                  <span className="text-muted shrink-0 text-xs">{formatDateTime(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
