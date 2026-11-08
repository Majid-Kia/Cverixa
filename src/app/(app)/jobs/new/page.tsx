import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/card";
import { getAISettings } from "@/features/ai-settings/service";
import { requireUser } from "@/server/security/session";
import { JobForm } from "../job-form";

export const metadata: Metadata = { title: "New Job Description" };
export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const user = await requireUser();
  const settings = await getAISettings(user.id);
  return (
    <>
      <PageHeader
        title="Add job description"
        description="Paste the posting text. Company, title and URL are optional and informational."
      />
      <Card>
        <JobForm mode="create" canAnalyze={Boolean(settings.defaultProviderId)} />
      </Card>
    </>
  );
}
