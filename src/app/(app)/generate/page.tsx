import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { getAISettings } from "@/features/ai-settings/service";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { listJobDescriptions } from "@/features/job-analysis/service";
import { requireUser } from "@/server/security/session";
import { templateOptions } from "@/templates";
import { GenerateForm } from "./generate-form";

export const metadata: Metadata = { title: "Generate Resume" };
export const dynamic = "force-dynamic";

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; mode?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const [profile, jobs, settings] = await Promise.all([
    getProfileSnapshot(user.id),
    listJobDescriptions(user.id),
    getAISettings(user.id),
  ]);
  const profileReady = Boolean(profile.revisionId && profile.confirmedAt);
  const providerReady = Boolean(settings.defaultProviderId && settings.defaultModelId);
  const provider = settings.definitions.find((definition) => definition.id === settings.defaultProviderId);

  return (
    <>
      <PageHeader
        title="Generate Resume"
        description="Quick Generate tailors your confirmed profile to a job in one step. Review Mode shows every proposed change for approval first."
      />
      {!profileReady ? (
        <Alert tone="warning" className="mb-4" title="Master profile not confirmed">
          Generation uses only confirmed facts.{" "}
          <Link href="/profile" className="font-medium underline">
            Confirm your profile
          </Link>{" "}
          or{" "}
          <Link href="/import" className="font-medium underline">
            import a resume
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
      {jobs.length === 0 ? (
        <Alert tone="info" className="mb-4">
          <Link href="/jobs/new" className="font-medium underline">
            Add a job description
          </Link>{" "}
          to generate a tailored resume.
        </Alert>
      ) : null}
      <Card>
        <GenerateForm
          jobs={jobs.map((job) => ({
            id: job.id,
            label: `${job.title || job.analysis?.jobTitle || "Untitled job"}${job.company ? ` @ ${job.company}` : ""}`,
            analysed: Boolean(job.analysis),
          }))}
          templates={templateOptions()}
          providers={settings.definitions
            .filter((definition) => definition.configured)
            .map((definition) => ({
              id: definition.id,
              label: definition.displayName,
              paid: definition.paid,
              savedModel: settings.settings.find((setting) => setting.providerId === definition.id)?.modelId ?? "",
            }))}
          defaultProviderId={settings.defaultProviderId ?? ""}
          defaultModelId={settings.defaultModelId ?? ""}
          defaultProviderLabel={provider ? `${provider.displayName} / ${settings.defaultModelId}` : ""}
          initialJobId={params.job ?? ""}
          initialMode={params.mode === "review" ? "review" : "quick"}
          disabled={!profileReady || !providerReady || jobs.length === 0}
        />
      </Card>
    </>
  );
}
