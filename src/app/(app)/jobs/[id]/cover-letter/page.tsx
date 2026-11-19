import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClasses, LinkButton } from "@/components/ui/button";
import { Alert, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { getAISettings } from "@/features/ai-settings/service";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { getCoverLetterForJob } from "@/features/cover-letter/service";
import { getJobDescription } from "@/features/job-analysis/service";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime } from "@/lib/utils";
import { requireUser } from "@/server/security/session";
import { CoverLetterEditor } from "./cover-letter-editor";
import { GenerateLetterForm } from "./generate-letter-form";

export const metadata: Metadata = { title: "Cover Letter" };
export const dynamic = "force-dynamic";

export default async function CoverLetterPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;
  let job;
  try {
    job = await getJobDescription(user.id, id);
  } catch (caught) {
    if (caught instanceof NotFoundError) notFound();
    throw caught;
  }
  const [letter, profile, settings] = await Promise.all([
    getCoverLetterForJob(user.id, job.id),
    getProfileSnapshot(user.id),
    getAISettings(user.id),
  ]);
  const profileReady = Boolean(profile.revisionId && profile.confirmedAt);
  const providerReady = Boolean(settings.defaultProviderId && settings.defaultModelId);
  const provider = settings.definitions.find((definition) => definition.id === settings.defaultProviderId);
  const providerLabel = provider ? `${provider.displayName} / ${settings.defaultModelId}` : "";
  const jobLabel = [job.title || job.analysis?.jobTitle || "Untitled job", job.company].filter(Boolean).join(" @ ");

  return (
    <>
      <PageHeader
        title="Cover letter"
        description={`For ${jobLabel}`}
        actions={
          <>
            {letter ? (
              <a href={`/api/cover-letters/${letter.id}/pdf`} className={buttonClasses("primary", "md")}>
                Download PDF
              </a>
            ) : null}
            <LinkButton href={`/jobs/${job.id}`} variant="secondary">
              Back to job
            </LinkButton>
          </>
        }
      />
      {error ? (
        <Alert tone="danger" title="The cover letter was not generated" className="mb-4">
          {error}
        </Alert>
      ) : null}
      {!profileReady ? (
        <Alert tone="warning" className="mb-4" title="Master profile not confirmed">
          The letter is written only from confirmed facts.{" "}
          <Link href="/profile" className="font-medium underline">
            Confirm your profile
          </Link>{" "}
          first.
        </Alert>
      ) : null}
      {!providerReady ? (
        <Alert tone="warning" className="mb-4" title="No default AI provider">
          <Link href="/settings" className="font-medium underline">
            Choose a provider and model
          </Link>{" "}
          before generating.
        </Alert>
      ) : null}

      {letter ? (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Card>
            <CardTitle>Your letter</CardTitle>
            <p className="text-muted mb-3 text-xs">
              Generated {formatDateTime(letter.generatedAt)} with {letter.providerId} / {letter.modelId}
              {letter.edited ? " · edited by you" : ""}. The PDF adds your name, contact details and today&apos;s date
              above it.
            </p>
            {/* A new generation replaces the text, so the editor starts over from it. */}
            <CoverLetterEditor key={letter.generatedAt.toISOString()} letterId={letter.id} body={letter.body} />
          </Card>
          <div className="space-y-4">
            {letter.report.postingAsks.length > 0 ? (
              <Card>
                <CardTitle>What the posting asks you to include</CardTitle>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {letter.report.postingAsks.map((text, index) => (
                    <li key={index}>&ldquo;{text}&rdquo;</li>
                  ))}
                </ul>
                <p className="text-muted mt-2 text-xs">Check that the letter covers these before you send it.</p>
              </Card>
            ) : null}
            <Card>
              <CardTitle>Fact check</CardTitle>
              {letter.report.removed.length === 0 ? (
                <p className="text-muted text-sm">
                  Every sentence was checked against your confirmed profile. Nothing was removed.
                </p>
              ) : (
                <>
                  <p className="text-muted mb-2 text-sm">
                    These sentences were removed because your confirmed profile does not support them. If one is true,
                    add it back in your own words.
                  </p>
                  <ul className="space-y-2 text-sm">
                    {letter.report.removed.map((item, index) => (
                      <li key={index}>
                        &ldquo;{item.text}&rdquo;
                        <span className="text-muted block text-xs">{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {letter.report.notClaimed.length > 0 ? (
                <>
                  <h3 className="mt-4 mb-1 text-sm font-semibold">Not claimed in the letter</h3>
                  <p className="text-muted mb-2 text-xs">
                    The job screens on these and your profile does not fully show them, so the letter leaves them out.
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {letter.report.notClaimed.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
            <Card>
              <CardTitle>Generate again</CardTitle>
              <GenerateLetterForm
                jobId={job.id}
                mode="regenerate"
                edited={letter.edited}
                instructions={letter.userInstructions}
                providerLabel={providerLabel}
                disabled={!profileReady || !providerReady}
              />
            </Card>
          </div>
        </div>
      ) : (
        <Card className="max-w-2xl">
          <CardTitle>Generate a cover letter</CardTitle>
          <p className="text-muted mb-4 text-sm">
            The letter is written from your confirmed Master Career Profile for this job. It leads with the work that
            fits the role best, and every sentence is checked against your profile before you see it. You can edit the
            result and download it as a PDF.
          </p>
          <GenerateLetterForm
            jobId={job.id}
            mode="generate"
            edited={false}
            instructions=""
            providerLabel={providerLabel}
            disabled={!profileReady || !providerReady}
          />
        </Card>
      )}
    </>
  );
}
