import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { deleteResumeAction, duplicateRevisionAction, restoreRevisionAction } from "@/features/resume-history/actions";
import { ApplicationChecklistCard, ScreeningCriteriaCard } from "@/features/resume-tailoring/application-brief-cards";
import { getResume } from "@/features/resume-history/service";
import { ResumeEditor } from "@/features/resume-rendering/resume-editor";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime } from "@/lib/utils";
import { requireUser } from "@/server/security/session";
import { getTemplate, templateOptions } from "@/templates";

export const metadata: Metadata = { title: "Resume" };
export const dynamic = "force-dynamic";

export default async function ResumePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revision?: string; generated?: string; restored?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  let resume;
  try {
    resume = await getResume(user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const revision = resume.revisions.find((item) => item.id === query.revision) ?? resume.revisions[0];
  if (!revision) notFound();
  const isLatest = revision.id === resume.revisions[0].id;
  const report = revision.changeReport;
  const brief = report?.brief ?? null;

  return (
    <>
      <PageHeader
        title={resume.title}
        description={
          resume.jobDescription
            ? `Tailored for ${[resume.jobDescription.title, resume.jobDescription.company].filter(Boolean).join(" @ ") || "a job description"}`
            : "Created from your master profile"
        }
        actions={
          <>
            <a
              href={`/api/resumes/${resume.id}/pdf?revision=${revision.id}`}
              className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-md px-4 text-sm font-medium hover:bg-blue-800"
            >
              Download PDF (v{revision.version})
            </a>
            <form action={deleteResumeAction}>
              <input type="hidden" name="resumeId" value={resume.id} />
              <Button type="submit" variant="danger">
                Delete resume
              </Button>
            </form>
          </>
        }
      />

      {query.generated ? (
        <Alert tone="success" className="mb-4" title="Resume generated and saved">
          Review the summary of changes below, adjust anything in the editor, and download the PDF when ready.
        </Alert>
      ) : null}
      {query.saved ? (
        <Alert tone="success" className="mb-4">
          Saved as version {query.saved}.
        </Alert>
      ) : null}
      {query.restored ? (
        <Alert tone="success" className="mb-4">
          Restored as version {query.restored}.
        </Alert>
      ) : null}
      {!isLatest ? (
        <Alert tone="warning" className="mb-4">
          You are viewing version {revision.version} (not the latest). Saving from the editor creates a new version on
          top of the latest one.
        </Alert>
      ) : null}

      <ResumeEditor
        key={revision.id}
        resumeId={resume.id}
        revision={{
          id: revision.id,
          version: revision.version,
          templateId: revision.templateId,
          pageFormat: revision.pageFormat,
          content: revision.content,
        }}
        templates={templateOptions()}
      />

      {brief ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <ScreeningCriteriaCard brief={brief} />
            {brief.question ? (
              <Card>
                <CardTitle>Open question</CardTitle>
                <p className="text-sm">{brief.question.text}</p>
                <p className="text-muted mt-1 text-xs">
                  About {brief.question.entryLabel}. If you have this detail, add it to that entry in your{" "}
                  <Link href="/profile" className="text-primary hover:underline">
                    Master Career Profile
                  </Link>{" "}
                  or answer it in Review Mode; it is never filled in for you.
                </p>
              </Card>
            ) : null}
          </div>
          <ApplicationChecklistCard brief={brief} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Change report (v{revision.version})</CardTitle>
          {report ? (
            <div className="space-y-3 text-sm">
              <ul className="list-disc space-y-1 pl-5">
                <li>Summary {report.summaryChanged ? "rewritten" : "unchanged"}.</li>
                <li>
                  {report.rewordedBullets} bullets reworded, {report.composedBullets} combined from multiple sources,{" "}
                  {report.removedBullets.length} removed.
                </li>
                {report.omittedExperience.length ? <li>Omitted roles: {report.omittedExperience.join("; ")}</li> : null}
                {report.omittedProjects.length ? <li>Omitted projects: {report.omittedProjects.join("; ")}</li> : null}
                <li>Skills {report.reorderedSkills ? "reordered by relevance" : "in original order"}.</li>
                <li>Sections {report.reorderedSections ? "reordered" : "in default order"}.</li>
              </ul>
              {report.removedBullets.length ? (
                <details>
                  <summary className="cursor-pointer font-medium">
                    Removed content ({report.removedBullets.length})
                  </summary>
                  <ul className="text-muted mt-1 list-disc space-y-1 pl-5">
                    {report.removedBullets.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {report.rejectedClaims.length ? (
                <details open>
                  <summary className="text-warning cursor-pointer font-medium">
                    Rejected AI claims ({report.rejectedClaims.length})
                  </summary>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {report.rejectedClaims.map((claim, index) => (
                      <li key={index}>
                        <span className="font-medium">{claim.location}:</span> &ldquo;{claim.text}&rdquo; —{" "}
                        {claim.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {report.missingRequirements.length ? (
                <details>
                  <summary className="cursor-pointer font-medium">
                    Job requirements without full evidence ({report.missingRequirements.length})
                  </summary>
                  <ul className="text-muted mt-1 list-disc space-y-1 pl-5">
                    {report.missingRequirements.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {report.notes.length ? (
                <details>
                  <summary className="cursor-pointer font-medium">AI notes</summary>
                  <ul className="text-muted mt-1 list-disc space-y-1 pl-5">
                    {report.notes.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : (
            <p className="text-muted text-sm">No AI change report for this version (manual edit or restore).</p>
          )}
          {revision.generationMetadata ? (
            <p className="text-muted mt-3 text-xs">
              Generated {formatDateTime(revision.generationMetadata.generatedAt)} with{" "}
              {revision.generationMetadata.providerId} / {revision.generationMetadata.modelId} in{" "}
              {revision.generationMetadata.mode} mode
              {revision.careerProfileRevisionId
                ? ` from profile revision ${revision.careerProfileRevisionId.slice(0, 8)}`
                : ""}
              .
            </p>
          ) : null}
        </Card>

        <Card>
          <CardTitle>Versions</CardTitle>
          <ul className="divide-border divide-y text-sm">
            {resume.revisions.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <Link
                    href={`/resumes/${resume.id}?revision=${item.id}`}
                    className={item.id === revision.id ? "font-semibold" : "text-primary hover:underline"}
                  >
                    Version {item.version}
                  </Link>
                  <span className="text-muted ml-2">
                    {getTemplate(item.templateId).name} · {item.pageFormat} · {formatDateTime(item.createdAt)}
                  </span>
                  {item.id === resume.revisions[0].id ? <Badge className="ml-2">Latest</Badge> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.validationStatus} />
                  <a
                    href={`/api/resumes/${resume.id}/pdf?revision=${item.id}`}
                    className="text-primary hover:underline"
                  >
                    PDF
                  </a>
                  <form action={restoreRevisionAction}>
                    <input type="hidden" name="revisionId" value={item.id} />
                    <button type="submit" className="text-primary hover:underline">
                      Restore
                    </button>
                  </form>
                  <form action={duplicateRevisionAction}>
                    <input type="hidden" name="revisionId" value={item.id} />
                    <button type="submit" className="text-primary hover:underline">
                      Duplicate
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
