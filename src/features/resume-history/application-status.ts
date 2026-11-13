import { z } from "zod";

/**
 * Manual application tracking. The status is set by the owner, belongs to the
 * resume (not to one of its versions) and starts as `pending`.
 */
export const applicationStatusSchema = z.enum(["pending", "interview", "rejected"]);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

export const DEFAULT_APPLICATION_STATUS: ApplicationStatus = "pending";

export const APPLICATION_STATUS_OPTIONS: ReadonlyArray<{ value: ApplicationStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "interview", label: "Interview" },
  { value: "rejected", label: "Rejected" },
];

export function applicationStatusLabel(status: ApplicationStatus): string {
  return APPLICATION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}
