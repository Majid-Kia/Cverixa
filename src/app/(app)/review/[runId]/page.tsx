import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { getReviewRun } from "@/features/resume-tailoring/service";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/server/security/session";
import { ReviewPanel } from "./review-panel";

export const metadata: Metadata = { title: "Review Changes" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  const { runId } = await params;
  let run;
  try {
    run = await getReviewRun(user.id, runId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const missing = run.evidence.matches.filter((match) => match.status !== "supported");

  return (
    <>
      <PageHeader
        title="Review proposed changes"
        description={`${run.jobTitle || "Job"}${run.company ? ` @ ${run.company}` : ""} · ${run.providerId} / ${run.modelId}`}
      />
      {run.status !== "awaiting_review" ? (
        <Alert tone="info" className="mb-4">
          This review was already completed.{" "}
          {run.resultResumeId ? (
            <Link href={`/resumes/${run.resultResumeId}`} className="font-medium underline">
              Open the resulting resume
            </Link>
          ) : null}
        </Alert>
      ) : null}
      {run.changeReport.rejectedClaims.length > 0 ? (
        <Alert
          tone="warning"
          title={`${run.changeReport.rejectedClaims.length} AI claims were rejected by factual validation`}
          className="mb-4"
        >
          <ul className="list-disc pl-5">
            {run.changeReport.rejectedClaims.slice(0, 10).map((claim, index) => (
              <li key={index}>
                <span className="font-medium">{claim.location}:</span> &ldquo;{claim.text}&rdquo; — {claim.reason}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[3fr_1fr]">
        <ReviewPanel runId={run.runId} proposals={run.proposals} closed={run.status !== "awaiting_review"} />
        <div className="space-y-4">
          <Card>
            <CardTitle>Missing requirements</CardTitle>
            {missing.length === 0 ? (
              <p className="text-muted text-sm">All extracted requirements are supported by confirmed evidence.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {missing.map((match) => (
                  <li key={match.requirementId}>
                    <Badge tone={match.status === "not_evidenced" ? "danger" : "warning"}>
                      {match.status.replace("_", " ")}
                    </Badge>{" "}
                    {match.classification === "mandatory" ? <span className="font-medium">[Mandatory] </span> : null}
                    {match.description}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>AI change notes</CardTitle>
            {run.changeReport.notes.length === 0 ? (
              <p className="text-muted text-sm">No notes.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {run.changeReport.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
