import type { Metadata } from "next";
import { Alert, PageHeader } from "@/components/ui/card";
import { saveProfileAction } from "@/features/career-profile/actions";
import { ProfileEditor } from "@/features/career-profile/profile-editor";
import { countProfileEntries } from "@/features/career-profile/schema";
import { getProfileSnapshot } from "@/features/career-profile/service";
import { formatDateTime } from "@/lib/utils";
import { requireUser } from "@/server/security/session";

export const metadata: Metadata = { title: "Master Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { saved } = await searchParams;
  const snapshot = await getProfileSnapshot(user.id);
  const counts = countProfileEntries(snapshot.data);
  return (
    <>
      <PageHeader
        title="Master Career Profile"
        description="The single source of truth for your professional history. Generated resumes are tailored snapshots of this profile and never change it."
      />
      {saved && snapshot.revisionId ? (
        <Alert tone="success" className="mb-4" title={`Profile saved as version ${snapshot.version}`}>
          {snapshot.confirmedAt
            ? "All entries are confirmed and eligible as evidence for tailoring."
            : "Saved as a draft. Confirm the profile to use it for generation."}
        </Alert>
      ) : null}
      {snapshot.revisionId ? (
        <Alert tone={snapshot.confirmedAt ? "success" : "warning"} className="mb-6">
          Version {snapshot.version}, saved {formatDateTime(snapshot.updatedAt)}.{" "}
          {snapshot.confirmedAt
            ? "Confirmed and eligible for tailoring."
            : "Draft only: confirm it to enable generation."}
          {counts.unconfirmed > 0 ? ` ${counts.unconfirmed} entries are still marked as imported or suggested.` : ""}
        </Alert>
      ) : (
        <Alert tone="info" className="mb-6">
          No profile yet. Fill in your details below or import an existing resume.
        </Alert>
      )}
      <ProfileEditor key={snapshot.revisionId ?? "empty"} initialData={snapshot.data} action={saveProfileAction} />
    </>
  );
}
