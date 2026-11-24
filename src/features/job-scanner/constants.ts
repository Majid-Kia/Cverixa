/**
 * Shared vocabulary of the Job Scanner. Safe to import from client components:
 * no server code and no data access.
 */

export const SPONSORSHIP_STATUSES = ["confirmed", "possible", "unknown", "none"] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];

export const SPONSORSHIP_LABELS: Record<SponsorshipStatus, string> = {
  confirmed: "Confirmed sponsorship",
  possible: "Possible sponsorship",
  unknown: "Sponsorship unknown",
  none: "No sponsorship",
};

/** What each status means, shown wherever the status is. */
export const SPONSORSHIP_DESCRIPTIONS: Record<SponsorshipStatus, string> = {
  confirmed: "The posting explicitly states that visa sponsorship is offered.",
  possible: "There is related evidence, but sponsorship for this position is not confirmed.",
  unknown: "The posting says nothing about visa sponsorship. This is not a confirmation.",
  none: "The posting explicitly says visa sponsorship is not available.",
};

/** Ordering priority: confirmed first, then possible, unknown, none. */
export const SPONSORSHIP_RANK: Record<SponsorshipStatus, number> = {
  confirmed: 0,
  possible: 1,
  unknown: 2,
  none: 3,
};

export const RELOCATION_STATUSES = ["offered", "not_offered", "unknown"] as const;
export type RelocationStatus = (typeof RELOCATION_STATUSES)[number];

export const RELOCATION_LABELS: Record<RelocationStatus, string> = {
  offered: "Relocation support stated",
  not_offered: "No relocation support",
  unknown: "Relocation not mentioned",
};

export const WORK_ARRANGEMENTS = ["onsite", "hybrid", "remote"] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export type ListingArrangement = WorkArrangement | "unknown";

export const WORK_ARRANGEMENT_LABELS: Record<ListingArrangement, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
  unknown: "Not stated",
};

export const LISTING_STATUSES = ["new", "saved", "applied", "interviewing", "rejected", "offer", "dismissed"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  new: "New",
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  rejected: "Rejected",
  offer: "Offer",
  dismissed: "Dismissed",
};

export const SCAN_STATUSES = ["running", "completed", "partial", "failed", "skipped"] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  running: "Running",
  completed: "Completed",
  partial: "Completed with errors",
  failed: "Failed",
  skipped: "Skipped",
};

export type ScanTrigger = "manual" | "scheduled";

export const SCAN_TRIGGER_LABELS: Record<ScanTrigger, string> = {
  manual: "Manual",
  scheduled: "Scheduled",
};

/** Where a scan is in its run. Stored on the scan so the page can show progress. */
export type ScanPhase = "starting" | "fetching" | "saving" | "analyzing" | "finishing" | "done";

export const SCAN_PHASE_LABELS: Record<ScanPhase, string> = {
  starting: "Starting",
  fetching: "Querying job sources",
  saving: "Saving new listings",
  analyzing: "Matching listings against your profile",
  finishing: "Finishing",
  done: "Done",
};

export interface ScanProgress {
  phase: ScanPhase;
  sourcesDone: number;
  sourcesTotal: number;
  analyzed: number;
  toAnalyze: number;
}

export const DEFAULT_KEYWORDS = [
  "Frontend Engineer",
  "Senior Frontend Engineer",
  "Senior Frontend Developer",
  "React Developer",
  "React Engineer",
  "Frontend Architect",
  "Frontend Tech Lead",
  "Frontend Team Lead",
  "Staff Frontend Engineer",
  "Software Engineer (Frontend)",
  "AI Product Engineer",
  "LLM Integration Engineer (Frontend-focused)",
];

/** Suggested target countries (ISO 3166-1 alpha-2). Any other country can be added. */
export const SUGGESTED_COUNTRY_CODES = [
  "DE",
  "NL",
  "AT",
  "SE",
  "DK",
  "GB",
  "IE",
  "PL",
  "CZ",
  "EE",
  "BE",
  "NO",
  "LU",
  "CH",
  "CA",
  "NZ",
  "AE",
  "SG",
  "QA",
];

/** Limits that keep a scan bounded in requests, time and AI cost. */
export const SCAN_LIMITS = {
  /** Sources queried at the same time. */
  sourceConcurrency: 3,
  /** Listings kept per source in one scan (most recent first). */
  maxJobsPerSource: 150,
  /** AI analyses running at the same time. */
  aiConcurrency: 2,
  /** Hard ceiling of the per-scan AI analysis setting. */
  maxAnalysesPerScanCeiling: 100,
  /** AI analysis stops for the rest of the scan after this many failures in a row. */
  aiFailureStreak: 3,
  /** Attempts per listing before it is left for a manual retry. */
  maxAnalysisAttempts: 3,
  /** A running scan without a heartbeat for this long is treated as interrupted. */
  staleScanMs: 15 * 60 * 1000,
  /** Manual scans per owner per hour. */
  manualScansPerHour: 6,
  /** A missed scheduled run is still executed when at most this late. */
  scheduleCatchUpMs: 12 * 60 * 60 * 1000,
  /** Longest description stored for a listing. */
  maxDescriptionLength: 30_000,
} as const;
