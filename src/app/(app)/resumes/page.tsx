import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui/card";
import { listResumes } from "@/features/resume-history/service";
import { formatDateTime, truncate } from "@/lib/utils";
import { requireUser } from "@/server/security/session";
import { getTemplate } from "@/templates";
import { ApplicationStatusSelect } from "./application-status-select";

export const metadata: Metadata = { title: "Resume History" };
export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const user = await requireUser();
  const resumes = await listResumes(user.id);
  return (
    <>
      <PageHeader
        title="Resume History"
        description="Every generated or edited resume is kept as an immutable version together with its job description, profile version, provider and change report."
        actions={<LinkButton href="/generate">Generate new</LinkButton>}
      />
      {resumes.length === 0 ? (
        <EmptyState
          title="No resumes yet"
          description="Generate a tailored resume from a job description to start your history."
          action={<LinkButton href="/generate">Generate resume</LinkButton>}
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-border divide-y">
            {resumes.map((resume) => (
              <li
                key={resume.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link href={`/resumes/${resume.id}`} className="text-primary font-medium hover:underline">
                    {truncate(resume.title, 80)}
                  </Link>
                  <p className="text-muted text-sm">
                    {resume.jobDescriptionId ? (
                      <Link href={`/jobs/${resume.jobDescriptionId}`} className="hover:underline">
                        {[resume.jobTitle, resume.company].filter(Boolean).join(" @ ") || "Job description"}
                      </Link>
                    ) : (
                      "No job description"
                    )}
                    {" · "}
                    {getTemplate(resume.latestTemplateId).name} · v{resume.latestVersion} ·{" "}
                    {formatDateTime(resume.updatedAt)}
                    {resume.latestProvider ? ` · ${resume.latestProvider}/${resume.latestModel}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ApplicationStatusSelect
                    resumeId={resume.id}
                    resumeTitle={resume.title}
                    initialStatus={resume.applicationStatus}
                  />
                  <StatusBadge status={resume.latestValidationStatus} />
                  <a
                    href={`/api/resumes/${resume.id}/pdf`}
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    Download PDF
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
