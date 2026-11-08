import type { Metadata } from "next";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { getAISettings } from "@/features/ai-settings/service";
import { importLimits } from "@/features/resume-import/service";
import { requireUser } from "@/server/security/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import Resume" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const user = await requireUser();
  const [settings, limits] = await Promise.all([getAISettings(user.id), importLimits()]);
  const provider = settings.definitions.find((definition) => definition.id === settings.defaultProviderId);
  return (
    <>
      <PageHeader
        title="Import Resume"
        description="Upload an existing resume to initialise your Master Career Profile. You will review and correct every extracted field before anything is saved."
      />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          {provider ? (
            <ImportForm
              maxSizeMb={Math.round(limits.maxFileSizeBytes / (1024 * 1024))}
              providerLabel={`${provider.displayName} / ${settings.defaultModelId}`}
              paid={provider.paid}
            />
          ) : (
            <Alert tone="warning" title="AI provider required">
              Importing uses your default AI provider to convert the document into structured data. Configure one in AI
              Settings first.
            </Alert>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 text-base font-semibold">What to expect</h2>
          <ul className="text-muted list-disc space-y-1 pl-5 text-sm">
            <li>
              Supported: text-based PDF and DOCX, up to {Math.round(limits.maxFileSizeBytes / (1024 * 1024))} MB and{" "}
              {limits.maxPages} pages.
            </li>
            <li>Scanned or image-only PDFs are rejected; export a text-based PDF instead.</li>
            <li>
              Dates, employers, metrics and links are preserved as written. Uncertain items are flagged for review.
            </li>
            <li>
              The original file is discarded after extraction; only the structured draft is kept until you confirm or
              discard it.
            </li>
            <li>The document text is sent to the selected AI provider for conversion.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
