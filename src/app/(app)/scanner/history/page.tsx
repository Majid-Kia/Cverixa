import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { SCAN_TRIGGER_LABELS } from "@/features/job-scanner/constants";
import { listScans } from "@/features/job-scanner/scan-service";
import { sourceLabel } from "@/features/job-scanner/sources/registry";
import { formatDateTime, truncate } from "@/lib/utils";
import { requireUser } from "@/server/security/session";
import { ScanStatusBadge } from "../badges";

export const metadata: Metadata = { title: "Scan History" };
export const dynamic = "force-dynamic";

export default async function ScanHistoryPage() {
  const user = await requireUser();
  const scans = await listScans(user.id, 50);
  return (
    <>
      <PageHeader
        title="Scan History"
        description="Every manual and scheduled scan, with what each source returned and what went wrong."
        actions={
          <LinkButton href="/scanner" variant="secondary">
            Back to Job Scanner
          </LinkButton>
        }
      />
      {scans.length === 0 ? (
        <EmptyState title="No scans yet" description="Start a scan from the Job Scanner page." />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-border text-muted border-b text-left text-xs tracking-wide uppercase">
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sources</th>
                  <th className="px-4 py-3 text-right">Found</th>
                  <th className="px-4 py-3 text-right">New</th>
                  <th className="px-4 py-3 text-right">Duplicates</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id} className="border-border border-b align-top last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/scanner/history/${scan.id}`} className="text-primary font-medium hover:underline">
                        {formatDateTime(scan.startedAt)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{SCAN_TRIGGER_LABELS[scan.trigger]}</td>
                    <td className="px-4 py-3">
                      <ScanStatusBadge status={scan.status} />
                    </td>
                    <td className="text-muted px-4 py-3 text-xs">
                      {scan.sources.map(sourceLabel).join(", ") || "None"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{scan.discoveredCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{scan.newCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{scan.duplicateCount}</td>
                    <td className="text-muted px-4 py-3 text-xs">
                      {scan.errorSummary ? truncate(scan.errorSummary, 120) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
