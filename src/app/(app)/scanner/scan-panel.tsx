"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge } from "@/components/ui/card";
import { startScanAction, type ScanActionState } from "@/features/job-scanner/actions";
import {
  SCAN_PHASE_LABELS,
  SCAN_STATUS_LABELS,
  type ScanProgress,
  type ScanStatus,
} from "@/features/job-scanner/constants";

interface ScanSnapshot {
  id: string;
  status: ScanStatus;
  progress: ScanProgress | null;
  discoveredCount: number;
  newCount: number;
  duplicateCount: number;
  analyzedCount: number;
  errorSummary: string | null;
}

const initialState: ScanActionState = { ok: false, error: null, message: null };

const TONES: Record<ScanStatus, "info" | "success" | "warning" | "danger" | "neutral"> = {
  running: "info",
  completed: "success",
  partial: "warning",
  failed: "danger",
  skipped: "neutral",
};

function percent(progress: ScanProgress | null): number {
  if (!progress) return 5;
  if (progress.phase === "done") return 100;
  const sources = progress.sourcesTotal > 0 ? progress.sourcesDone / progress.sourcesTotal : 0;
  if (progress.phase === "starting") return 5;
  if (progress.phase === "fetching") return 5 + Math.round(sources * 45);
  if (progress.phase === "saving") return 55;
  if (progress.phase === "analyzing") {
    const analysed = progress.toAnalyze > 0 ? progress.analyzed / progress.toAnalyze : 0;
    return 60 + Math.round(analysed * 35);
  }
  return 97;
}

/**
 * "Scan Jobs Now" with live progress. The scan itself runs on the server; this
 * component only asks for its state every two seconds while it is running and
 * refreshes the page's results when it finishes. Closing the page does not
 * stop the scan.
 */
export function ScanPanel({ running, disabled }: { running: ScanSnapshot | null; disabled: boolean }) {
  const router = useRouter();
  const [state, action] = useActionState(startScanAction, initialState);
  const [scan, setScan] = useState<ScanSnapshot | null>(running);
  const [finished, setFinished] = useState<ScanSnapshot | null>(null);
  /** Scans this component has already seen finish; they are not followed again. */
  const [completed, setCompleted] = useState<string[]>([]);

  const scanId = running?.id ?? state.scanId ?? null;
  useEffect(() => {
    if (!scanId || completed.includes(scanId)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/job-scanner/scans/${scanId}`, { cache: "no-store" });
        if (response.ok && !stopped) {
          const data = (await response.json()) as ScanSnapshot;
          if (data.status === "running") setScan(data);
          else {
            setCompleted((ids) => (ids.includes(scanId) ? ids : [...ids, scanId]));
            setScan(null);
            setFinished(data);
            router.refresh();
            return;
          }
        }
      } catch {
        // A failed poll is retried; the scan is unaffected.
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [scanId, router, completed]);

  // A scan is in progress from the moment it is started until this component has seen it finish.
  const active = scanId !== null && !completed.includes(scanId);
  const progress = scan?.progress ?? null;
  const value = percent(progress);

  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={disabled || active} pendingLabel="Starting scan...">
          {active ? "Scan in progress..." : "Scan Jobs Now"}
        </SubmitButton>
        {active ? <Badge tone="info">Running on the server</Badge> : null}
      </form>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {active ? (
        <div role="status" aria-live="polite" className="border-border rounded-md border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{SCAN_PHASE_LABELS[progress?.phase ?? "starting"]}</span>
            <span className="text-muted">{value}%</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
            aria-label="Scan progress"
          >
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${value}%` }} />
          </div>
          <p className="text-muted mt-2 text-xs">
            {progress && progress.sourcesTotal > 0
              ? `Sources ${progress.sourcesDone} of ${progress.sourcesTotal}`
              : "Preparing sources"}
            {progress && progress.toAnalyze > 0 ? ` · analysed ${progress.analyzed} of ${progress.toAnalyze}` : ""}
            {scan && scan.discoveredCount > 0 ? ` · ${scan.discoveredCount} matching listings so far` : ""}. You can
            leave this page; the scan continues.
          </p>
        </div>
      ) : null}
      {finished ? (
        <Alert tone={TONES[finished.status]} title={`Scan ${SCAN_STATUS_LABELS[finished.status].toLowerCase()}`}>
          {finished.discoveredCount} matching listing{finished.discoveredCount === 1 ? "" : "s"} found:{" "}
          {finished.newCount} new, {finished.duplicateCount} already known. {finished.analyzedCount} analysed.
          {finished.errorSummary ? <span className="mt-1 block">{finished.errorSummary}</span> : null}
        </Alert>
      ) : null}
    </div>
  );
}
