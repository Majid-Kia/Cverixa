import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { requireUser } from "@/server/security/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import a Job Posting" };
export const dynamic = "force-dynamic";

export default async function ImportPostingPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Import a Job Posting"
        description="Add a posting you found on LinkedIn, Indeed or any other site the scanner does not read. It is classified, scored and tracked like a scanned listing."
        actions={
          <LinkButton href="/scanner" variant="secondary">
            Back to Job Scanner
          </LinkButton>
        }
      />
      <Alert tone="info" className="mb-4" title="Nothing is fetched from the link">
        Cverixa does not open the page behind the link: sites such as LinkedIn do not permit automated reading. The link
        is stored so you can return to the posting; the text you paste is what gets analysed.
      </Alert>
      <Card>
        <ImportForm />
      </Card>
    </>
  );
}
