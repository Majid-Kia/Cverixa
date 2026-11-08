import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { getAISettings } from "@/features/ai-settings/service";
import { countProfileEntries } from "@/features/career-profile/schema";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { listJobDescriptions } from "@/features/job-analysis/service";
import { listResumes } from "@/features/resume-history/service";
import { formatDateTime, truncate } from "@/lib/utils";
import { requireUser } from "@/server/security/session";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [profile, jobs, resumes, ai] = await Promise.all([
    getProfileSnapshot(user.id),
    listJobDescriptions(user.id, 5),
    listResumes(user.id, 5),
    getAISettings(user.id),
  ]);
  const counts = countProfileEntries(profile.data);
  const profileReady = Boolean(profile.revisionId && profile.confirmedAt);
  const providerDefinition = ai.definitions.find((definition) => definition.id === ai.defaultProviderId);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Upload your resume once, tailor it to any job description, and export a professional PDF."
        actions={
          <>
            <LinkButton href="/generate">Quick Generate</LinkButton>
            <LinkButton href="/import" variant="secondary">
              Import Resume
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Master Career Profile</CardTitle>
          {profile.revisionId ? (
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <span className="font-medium">{profile.data.personal.fullName || "Unnamed profile"}</span>
                {profileReady ? (
                  <Badge tone="success">Confirmed</Badge>
                ) : (
                  <Badge tone="warning">Draft, not confirmed</Badge>
                )}
              </p>
              <p className="text-muted">
                {counts.experience} roles, {counts.skills} skills, {counts.projects} projects, {counts.education}{" "}
                education entries.
                {counts.unconfirmed > 0 ? ` ${counts.unconfirmed} entries await confirmation.` : ""}
              </p>
              <p className="text-muted">
                Version {profile.version}, updated {formatDateTime(profile.updatedAt)}.
              </p>
              <Link href="/profile" className="text-primary font-medium hover:underline">
                Edit profile
              </Link>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-muted">No profile yet. Import an existing resume or create one manually.</p>
              <div className="flex gap-3">
                <Link href="/import" className="text-primary font-medium hover:underline">
                  Import resume
                </Link>
                <Link href="/profile" className="text-primary font-medium hover:underline">
                  Create manually
                </Link>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Active AI provider</CardTitle>
          {providerDefinition ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium">
                {providerDefinition.displayName} <span className="text-muted">/ {ai.defaultModelId}</span>
              </p>
              <p className="text-muted">
                {providerDefinition.paid
                  ? "Cloud provider: usage may incur charges."
                  : "Local provider: no external API charges."}
              </p>
              <Link href="/settings" className="text-primary font-medium hover:underline">
                Change provider
              </Link>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="text-muted">No default provider configured. Generation is disabled until you choose one.</p>
              <Link href="/settings" className="text-primary font-medium hover:underline">
                Configure AI settings
              </Link>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Recent resumes</CardTitle>
          {resumes.length === 0 ? (
            <p className="text-muted text-sm">No generated resumes yet.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {resumes.map((resume) => (
                <li key={resume.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/resumes/${resume.id}`} className="text-primary font-medium hover:underline">
                      {truncate(resume.title, 60)}
                    </Link>
                    <p className="text-muted text-xs">
                      v{resume.latestVersion} · {formatDateTime(resume.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge status={resume.latestValidationStatus} />
                </li>
              ))}
            </ul>
          )}
          <Link href="/resumes" className="text-primary mt-3 inline-block text-sm font-medium hover:underline">
            View history
          </Link>
        </Card>

        <Card>
          <CardTitle>Recent job descriptions</CardTitle>
          {jobs.length === 0 ? (
            <p className="text-muted text-sm">No job descriptions saved yet.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/jobs/${job.id}`} className="text-primary font-medium hover:underline">
                      {truncate(job.title || job.analysis?.jobTitle || "Untitled job", 50)}
                    </Link>
                    <p className="text-muted text-xs">
                      {job.company || "Unknown company"} · {formatDateTime(job.createdAt)}
                    </p>
                  </div>
                  {job.analysis ? <Badge tone="success">Analysed</Badge> : <Badge>Not analysed</Badge>}
                </li>
              ))}
            </ul>
          )}
          <Link href="/jobs/new" className="text-primary mt-3 inline-block text-sm font-medium hover:underline">
            Add job description
          </Link>
        </Card>
      </div>
    </>
  );
}
