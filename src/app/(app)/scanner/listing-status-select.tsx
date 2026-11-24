"use client";

import { useRef, useTransition } from "react";
import { Select } from "@/components/ui/fields";
import { setListingStatusAction } from "@/features/job-scanner/actions";
import { LISTING_STATUSES, LISTING_STATUS_LABELS, type ListingStatus } from "@/features/job-scanner/constants";
import { cn } from "@/lib/utils";

const TONES: Record<ListingStatus, string> = {
  new: "border-blue-300 bg-blue-50 text-blue-900",
  saved: "border-slate-300 bg-slate-50 text-slate-800",
  applied: "border-amber-300 bg-amber-50 text-amber-900",
  interviewing: "border-green-300 bg-green-50 text-green-900",
  offer: "border-green-400 bg-green-100 text-green-900",
  rejected: "border-red-300 bg-red-50 text-red-900",
  dismissed: "border-slate-200 bg-white text-slate-500",
};

/** Tracking status of one listing. A selection is saved as soon as it is made. */
export function ListingStatusSelect({
  listingId,
  title,
  status,
}: {
  listingId: string;
  title: string;
  status: ListingStatus;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      ref={form}
      action={(formData) => startTransition(() => setListingStatusAction(formData))}
      className="inline-flex"
    >
      <input type="hidden" name="id" value={listingId} />
      <Select
        name="status"
        aria-label={`Status of ${title}`}
        aria-busy={pending}
        defaultValue={status}
        key={status}
        onChange={() => form.current?.requestSubmit()}
        className={cn("h-9 w-36 py-1", TONES[status])}
      >
        {LISTING_STATUSES.map((value) => (
          <option key={value} value={value}>
            {LISTING_STATUS_LABELS[value]}
          </option>
        ))}
      </Select>
    </form>
  );
}
