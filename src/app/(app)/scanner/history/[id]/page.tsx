import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkButton } from "@/components/ui/button";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { SCAN_TRIGGER_LABELS } from "@/features/job-scanner/constants";
import { countryName } from "@/features/job-scanner/countries";
import { SKIP_REASON_LABELS, type SkipReason } from "@/features/job-scanner/pipeline";
import { getScanDetail } from "@/features/job-scanner/scan-service";
import { sourceLabel } from "@/features/job-scanner/sources/registry";
import { NotFoundError } from "@/lib/errors";
import { formatDateTime } from "@/lib/utils";
import { requireUser } from "@/server/security/session";
import { ScanStatusBadge } from "../../badges";

export const metadata: Metadata = { title: "Scan" };
export const dynamic = "force-dynamic";

const reasonLabel = (reason: string) => SKIP_REASON_LABELS[reason as SkipReason] ?? reason;

function duration(from: Date, to: Date | null): string {
  if (!to) return "In progress";
  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let scan;
  try {
    scan = await getScanDetail(user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const skipped = Object.entries(scan.diagnostics.skipped).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        title={`Scan of ${formatDateTime(scan.startedAt)}`}
        description={`Scan ID ${scan.id}`}
        actions={
          <LinkButton href="/scanner/history" variant="secondary">
            Back to history
          </LinkButton>
        }
      />
      {scan.errorSummary ? (
        <Alert tone={scan.status === "failed" ? "danger" : "warning"} className="mb-4" title="Notes from this scan">
          {scan.errorSummary}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardTitle>Run</CardTitle>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Status</dt>
              <dd>
                <ScanStatusBadge status={scan.status} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Trigger</dt>
              <dd>
                {SCAN_TRIGGER_LABELS[scan.trigger]}
                {scan.scheduledFor ? ` (slot ${formatDateTime(scan.scheduledFor)})` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Started</dt>
              <dd>{formatDateTime(scan.startedAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Finished</dt>
              <dd>{scan.finishedAt ? formatDateTime(scan.finishedAt) : "Not finished"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Duration</dt>
              <dd>{duration(scan.startedAt, scan.finishedAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Postings read from sources</dt>
              <dd className="tabular-nums">{scan.diagnostics.fetched}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Matching jobs discovered</dt>
              <dd className="tabular-nums">{scan.discoveredCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">New jobs saved</dt>
              <dd className="tabular-nums">{scan.newCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Duplicates detected</dt>
              <dd className="tabular-nums">{scan.duplicateCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Left out by your filters</dt>
              <dd className="tabular-nums">{scan.filteredCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Analysed with AI</dt>
              <dd className="tabular-nums">{scan.analyzedCount}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-2 text-sm">
            <p>
              <span className="text-muted">Countries searched: </span>
              {scan.countries.length ? scan.countries.map(countryName).join(", ") : "Any country"}
            </p>
            <p>
              <span className="text-muted">Job titles: </span>
              {scan.keywords.join(", ") || "None"}
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardTitle>Sources queried</CardTitle>
            {scan.sourceResults.length === 0 ? (
              <p className="text-muted text-sm">No source was queried in this run.</p>
            ) : (
              <ul className="divide-border divide-y">
                {scan.sourceResults.map((result) => (
                  <li key={result.sourceId} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{sourceLabel(result.sourceId)}</p>
                      <Badge
                        tone={
                          result.status === "completed" ? "success" : result.status === "failed" ? "danger" : "neutral"
                        }
                      >
                        {result.status === "completed"
                          ? "Completed"
                          : result.status === "failed"
                            ? "Failed"
                            : "Skipped"}
                      </Badge>
                    </div>
                    <p className="text-muted mt-1 text-xs">
                      {result.fetchedCount} read · {result.matchedCount} matched your preferences · {result.newCount}{" "}
                      new · {result.duplicateCount} already known · {result.requestCount} request
                      {result.requestCount === 1 ? "" : "s"} · {(result.durationMs / 1000).toFixed(1)} s
                    </p>
                    {result.error ? (
                      <p
                        className={result.status === "failed" ? "text-danger mt-1 text-sm" : "text-muted mt-1 text-sm"}
                      >
                        {result.error}
                      </p>
                    ) : null}
                    {Object.keys(result.skipped).length > 0 ? (
                      <p className="text-muted mt-1 text-xs">
                        Left out:{" "}
                        {Object.entries(result.skipped)
                          .map(([reason, count]) => `${count} ${reasonLabel(reason).toLowerCase()}`)
                          .join("; ")}
                      </p>
                    ) : null}
                    {result.warnings.length > 0 ? (
                      <ul className="text-warning mt-1 list-disc pl-5 text-xs">
                        {result.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {skipped.length > 0 ? (
            <Card>
              <CardTitle>Why postings were left out</CardTitle>
              <ul className="space-y-1 text-sm">
                {skipped.map(([reason, count]) => (
                  <li key={reason} className="flex justify-between gap-3">
                    <span>{reasonLabel(reason)}</span>
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
