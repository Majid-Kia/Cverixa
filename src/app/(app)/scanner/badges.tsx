import { Badge } from "@/components/ui/card";
import {
  RELOCATION_LABELS,
  SCAN_STATUS_LABELS,
  SPONSORSHIP_DESCRIPTIONS,
  SPONSORSHIP_LABELS,
  type RelocationStatus,
  type ScanStatus,
  type SponsorshipStatus,
} from "@/features/job-scanner/constants";
import { cn } from "@/lib/utils";

const SPONSORSHIP_TONES: Record<SponsorshipStatus, "success" | "info" | "neutral" | "danger"> = {
  confirmed: "success",
  possible: "info",
  unknown: "neutral",
  none: "danger",
};

export function SponsorshipBadge({ status }: { status: SponsorshipStatus }) {
  return (
    <span title={SPONSORSHIP_DESCRIPTIONS[status]}>
      <Badge tone={SPONSORSHIP_TONES[status]}>{SPONSORSHIP_LABELS[status]}</Badge>
    </span>
  );
}

export function RelocationBadge({ status }: { status: RelocationStatus }) {
  if (status === "unknown") return null;
  return <Badge tone={status === "offered" ? "success" : "neutral"}>{RELOCATION_LABELS[status]}</Badge>;
}

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const tone =
    status === "completed"
      ? "success"
      : status === "partial"
        ? "warning"
        : status === "failed"
          ? "danger"
          : status === "running"
            ? "info"
            : "neutral";
  return <Badge tone={tone}>{SCAN_STATUS_LABELS[status]}</Badge>;
}

/** Job Match Score, or a plain note that there is none yet. Never a guess. */
export function MatchScore({ score, size = "md" }: { score: number | null; size?: "md" | "lg" }) {
  if (score === null) {
    return (
      <span className="text-muted text-xs" title="This listing has not been analysed yet.">
        Not scored
      </span>
    );
  }
  const tone =
    score >= 70
      ? "border-green-300 bg-green-50 text-green-900"
      : score >= 45
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-slate-300 bg-slate-50 text-slate-700";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-semibold tabular-nums",
        size === "lg" ? "h-14 w-14 text-xl" : "h-9 w-11 text-sm",
        tone,
      )}
      title="Job Match Score (0-100): relevance to your confirmed profile, not the chance of an interview."
      aria-label={`Job Match Score ${score} out of 100`}
    >
      {score}
    </span>
  );
}
