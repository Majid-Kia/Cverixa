"use client";

import { useRef, useState } from "react";
import { Select } from "@/components/ui/fields";
import { setApplicationStatusAction } from "@/features/resume-history/actions";
import {
  APPLICATION_STATUS_OPTIONS,
  applicationStatusLabel,
  applicationStatusSchema,
  type ApplicationStatus,
} from "@/features/resume-history/application-status";
import { cn } from "@/lib/utils";

const TONES: Record<ApplicationStatus, string> = {
  pending: "border-slate-300 bg-slate-50 text-slate-800",
  interview: "border-green-300 bg-green-50 text-green-900",
  rejected: "border-red-300 bg-red-50 text-red-900",
};

/**
 * Application status for one resume row. A selection is saved as soon as it is
 * made; if saving fails the selector goes back to the last saved status and
 * says so.
 */
export function ApplicationStatusSelect({
  resumeId,
  resumeTitle,
  initialStatus,
}: {
  resumeId: string;
  resumeTitle: string;
  initialStatus: ApplicationStatus;
}) {
  const [status, setStatus] = useState<ApplicationStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the server last confirmed; the value to fall back to. */
  const saved = useRef<ApplicationStatus>(initialStatus);
  /** Only the most recent request may update the row. */
  const latest = useRef(0);

  const change = async (next: ApplicationStatus) => {
    const request = ++latest.current;
    setStatus(next);
    setError(null);
    setSaving(true);
    let failure: string | null = null;
    try {
      const result = await setApplicationStatusAction(resumeId, next);
      if (result.ok) saved.current = result.status;
      else failure = result.error;
    } catch {
      failure = "Could not reach the server.";
    }
    if (request !== latest.current) return;
    setSaving(false);
    if (failure) {
      setStatus(saved.current);
      setError(`Status not saved. ${failure} It is still ${applicationStatusLabel(saved.current)}.`);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Select
        aria-label={`Application status for ${resumeTitle}`}
        aria-busy={saving}
        value={status}
        onChange={(event) => {
          const next = applicationStatusSchema.safeParse(event.target.value);
          if (next.success) void change(next.data);
        }}
        className={cn("h-9 w-32 py-1", TONES[status])}
      >
        {APPLICATION_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {error ? (
        <p role="alert" className="text-danger max-w-56 text-xs sm:text-right">
          {error}
        </p>
      ) : null}
    </div>
  );
}
