import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { getAISettings } from "@/features/ai-settings/service";
import { confirmedFactsOnly } from "@/features/career-profile/schema";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { deleteJobAction } from "@/features/job-analysis/actions";
import { getJobDescription } from "@/features/job-analysis/service";
import { matchEvidence } from "@/features/resume-tailoring/evidence";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime } from "@/lib/utils";
import { requireUser } from "@/server/security/session";
import { JobForm } from "../job-form";
import { AnalyzeForm } from "./analyze-form";

export const metadata: Metadata = { title: "Job Description" };
export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ analysisError?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { analysisError } = await searchParams;
  let job;
  try {
    job = await getJobDescription(user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const [settings, profile] = await Promise.all([getAISettings(user.id), getProfileSnapshot(user.id)]);
  const evidence =
    job.analysis && profile.confirmedAt ? matchEvidence(confirmedFactsOnly(profile.data), job.analysis) : null;

  return (
    <>
      <PageHeader
        title={job.title || job.analysis?.jobTitle || "Untitled job"}
        description={[job.company, job.location].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <LinkButton href={`/generate?job=${job.id}`}>Generate resume</LinkButton>
            <form action={deleteJobAction}>
              <input type="hidden" name="id" value={job.id} />
              <Button type="submit" variant="danger">
                Delete
              </Button>
            </form>
          </>
        }
      />
      {analysisError ? (
        <Alert tone="danger" title="Saved, but analysis failed" className="mb-6">
          {analysisError}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="mb-0">Requirement analysis</CardTitle>
              <AnalyzeForm
                jobId={job.id}
                canAnalyze={Boolean(settings.defaultProviderId)}
                analyzed={Boolean(job.analysis)}
              />
            </div>
            {job.analysis ? (
              <>
                <p className="text-muted mb-3 text-sm">
                  {job.analysis.seniority ? `${job.analysis.seniority} · ` : ""}
                  analysed {formatDateTime(job.analyzedAt)} with {job.analysisProviderId} / {job.analysisModelId}
                </p>
                {job.analysis.summary ? <p className="mb-4 text-sm">{job.analysis.summary}</p> : null}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-border text-muted border-b text-left text-xs tracking-wide uppercase">
                        <th className="py-2 pr-3">Requirement</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Priority</th>
                        {evidence ? <th className="py-2 pr-3">Evidence</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {job.analysis.requirements.map((requirement) => {
                        const match = evidence?.matches.find((m) => m.requirementId === requirement.id);
                        return (
                          <tr key={requirement.id} className="border-border border-b align-top">
                            <td className="py-2 pr-3">
                              <p>{requirement.description}</p>
                              {requirement.supportingText ? (
                                <p className="text-muted mt-1 text-xs">&ldquo;{requirement.supportingText}&rdquo;</p>
                              ) : null}
                              {requirement.relatedSkills.length ? (
                                <p className="text-muted mt-1 text-xs">
                                  Skills: {requirement.relatedSkills.join(", ")}
                                </p>
                              ) : null}
                            </td>
                            <td className="py-2 pr-3">
                              <Badge tone={requirement.classification === "mandatory" ? "danger" : "neutral"}>
                                {requirement.classification}
                              </Badge>
                              <p className="text-muted mt-1 text-xs">{requirement.category.replace(/_/g, " ")}</p>
                            </td>
                            <td className="py-2 pr-3 capitalize">{requirement.priority}</td>
                            {evidence ? (
                              <td className="py-2 pr-3">
                                {match ? (
                                  <>
                                    <Badge
                                      tone={
                                        match.status === "supported"
                                          ? "success"
                                          : match.status === "partially_supported"
                                            ? "warning"
                                            : "danger"
                                      }
                                    >
                                      {match.status.replace("_", " ")}
                                    </Badge>
                                    {match.evidence.length ? (
                                      <ul className="text-muted mt-1 text-xs">
                                        {match.evidence.slice(0, 3).map((ref) => (
                                          <li key={`${ref.kind}-${ref.id}`}>{ref.label}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-muted mt-1 text-xs">{match.missing}</p>
                                    )}
                                  </>
                                ) : null}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {!evidence ? (
                  <p className="text-muted mt-3 text-xs">
                    Confirm your{" "}
                    <Link href="/profile" className="text-primary hover:underline">
                      Master Career Profile
                    </Link>{" "}
                    to see which requirements your experience supports.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted text-sm">
                Not analysed yet. Run the analysis to extract structured requirements.
              </p>
            )}
          </Card>
        </div>
        <Card>
          <CardTitle>Edit job description</CardTitle>
          <JobForm mode="edit" job={job} canAnalyze={Boolean(settings.defaultProviderId)} />
        </Card>
      </div>
    </>
  );
}
