import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/card";
import { ProfileEditor } from "@/features/career-profile/profile-editor";
import { confirmImportAction, discardImportAction } from "@/features/resume-import/actions";
import { getImportSession } from "@/features/resume-import/service";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/server/security/session";

export const metadata: Metadata = { title: "Review Import" };
export const dynamic = "force-dynamic";

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let session;
  try {
    session = await getImportSession(user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  return (
    <>
      <PageHeader
        title="Review imported profile"
        description={`Extracted from ${session.fileName}. Correct anything that is wrong, then confirm to make this your Master Career Profile.`}
        actions={
          <form action={discardImportAction}>
            <input type="hidden" name="sessionId" value={session.id} />
            <Button type="submit" variant="danger">
              Discard import
            </Button>
          </form>
        }
      />
      <Alert tone="info" className="mb-6">
        Nothing has been saved to your profile yet. Entries are marked as imported until you confirm them.
      </Alert>
      <ProfileEditor
        initialData={session.data}
        action={confirmImportAction}
        hiddenFields={{ sessionId: session.id }}
        warnings={session.warnings}
        saveLabel="Save draft (disabled for imports)"
        confirmLabel="Confirm as Master Profile"
      />
    </>
  );
}
