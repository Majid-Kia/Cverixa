/**
 * Daily schedule arithmetic. A schedule is a wall-clock time in an IANA time
 * zone ("05:00", "Europe/Amsterdam"); these functions turn it into the UTC
 * instant of the next run, following the zone's daylight-saving changes.
 * Pure: the caller supplies the current time.
 */

export const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Time zones offered in the preferences form. */
export function listTimeZones(): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The wall-clock date and time of an instant in a time zone. */
export function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") };
}

function offsetMs(instant: number, timeZone: string): number {
  const local = wallClock(new Date(instant), timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/**
 * The UTC instant at which a time zone's clocks show the given wall-clock
 * time. A time skipped by the spring change resolves to the instant the clocks
 * jump to; a time repeated in autumn resolves to its first occurrence.
 */
export function zonedTimeToUtc(local: WallClock, timeZone: string): Date {
  const naive = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const first = naive - offsetMs(naive, timeZone);
  const second = naive - offsetMs(first, timeZone);
  if (second === first) return new Date(first);
  // Around a clock change the two estimates differ; the earlier one that still
  // shows the requested time is the first occurrence, otherwise the time was skipped.
  const candidates = [first, second].sort((a, b) => a - b);
  for (const candidate of candidates) {
    const shown = wallClock(new Date(candidate), timeZone);
    if (shown.hour === local.hour && shown.minute === local.minute && shown.day === local.day) {
      return new Date(candidate);
    }
  }
  return new Date(candidates[1]);
}

/** The first run strictly after `after` for a daily schedule. */
export function nextRunAfter(after: Date, time: string, timeZone: string): Date {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new Error(`Invalid schedule time "${time}".`);
  if (!isValidTimeZone(timeZone)) throw new Error(`Invalid time zone "${timeZone}".`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const today = wallClock(after, timeZone);
  for (let offset = 0; offset <= 2; offset += 1) {
    // Roll the calendar date in UTC so month and year ends are handled.
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const candidate = zonedTimeToUtc(
      { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour, minute },
      timeZone,
    );
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  throw new Error("Could not compute the next scheduled run.");
}

export type DueDecision = "not_due" | "run" | "missed";

/**
 * What to do with a schedule slot at `now`. A slot that is due runs once, even
 * when the server was asleep at the exact time. A slot missed by more than the
 * catch-up window is skipped: running yesterday's scan shortly before today's
 * would only repeat it.
 */
export function decideDue(nextRunAt: Date | null, now: Date, catchUpMs: number): DueDecision {
  if (!nextRunAt || nextRunAt.getTime() > now.getTime()) return "not_due";
  return now.getTime() - nextRunAt.getTime() > catchUpMs ? "missed" : "run";
}
