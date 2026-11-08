import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { listJobDescriptions } from "@/features/job-analysis/service";
import { formatDateTime, truncate } from "@/lib/utils";
import { requireUser } from "@/server/security/session";

export const metadata: Metadata = { title: "Job Descriptions" };
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const user = await requireUser();
  const jobs = await listJobDescriptions(user.id);
  return (
    <>
      <PageHeader
        title="Job Descriptions"
        description="Paste job postings, analyse their requirements and generate tailored resumes from them."
        actions={<LinkButton href="/jobs/new">Add job description</LinkButton>}
      />
      {jobs.length === 0 ? (
        <EmptyState
          title="No job descriptions yet"
          description="Add a job description to analyse its requirements."
          action={<LinkButton href="/jobs/new">Add job description</LinkButton>}
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-border divide-y">
            {jobs.map((job) => (
              <li key={job.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/jobs/${job.id}`} className="text-primary font-medium hover:underline">
                    {truncate(job.title || job.analysis?.jobTitle || "Untitled job", 80)}
                  </Link>
                  <p className="text-muted text-sm">
                    {[job.company, job.location].filter(Boolean).join(" · ") || "No company specified"} · added{" "}
                    {formatDateTime(job.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {job.analysis ? (
                    <Badge tone="success">{job.analysis.requirements.length} requirements</Badge>
                  ) : (
                    <Badge>Not analysed</Badge>
                  )}
                  <Link href={`/generate?job=${job.id}`} className="text-primary text-sm font-medium hover:underline">
                    Generate
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
