import { describe, expect, it } from "vitest";
import { decideDue, isValidTimeZone, nextRunAfter, wallClock, zonedTimeToUtc } from "@/features/job-scanner/schedule";

const iso = (date: Date) => date.toISOString();

describe("daily schedule in a time zone", () => {
  it("validates IANA time zones", () => {
    expect(isValidTimeZone("Europe/Amsterdam")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("converts a wall-clock time to UTC in winter and summer", () => {
    const amsterdam = "Europe/Amsterdam";
    expect(iso(zonedTimeToUtc({ year: 2027, month: 1, day: 15, hour: 5, minute: 0 }, amsterdam))).toBe(
      "2027-01-15T04:00:00.000Z",
    );
    expect(iso(zonedTimeToUtc({ year: 2027, month: 7, day: 15, hour: 5, minute: 0 }, amsterdam))).toBe(
      "2027-07-15T03:00:00.000Z",
    );
    expect(wallClock(new Date("2027-07-15T03:00:00Z"), amsterdam)).toMatchObject({ hour: 5, minute: 0, day: 15 });
  });

  it("gives today's run before the time and tomorrow's after it", () => {
    const before = new Date("2027-01-15T03:59:00Z"); // 04:59 in Amsterdam
    expect(iso(nextRunAfter(before, "05:00", "Europe/Amsterdam"))).toBe("2027-01-15T04:00:00.000Z");
    const at = new Date("2027-01-15T04:00:00Z");
    expect(iso(nextRunAfter(at, "05:00", "Europe/Amsterdam"))).toBe("2027-01-16T04:00:00.000Z");
  });

  it("keeps the local time across daylight-saving changes", () => {
    // Clocks go forward on 28 March 2027 and back on 31 October 2027 in Amsterdam.
    const beforeSpring = new Date("2027-03-27T04:00:00Z");
    expect(iso(nextRunAfter(beforeSpring, "05:00", "Europe/Amsterdam"))).toBe("2027-03-28T03:00:00.000Z");
    const beforeAutumn = new Date("2027-10-30T03:00:00Z");
    expect(iso(nextRunAfter(beforeAutumn, "05:00", "Europe/Amsterdam"))).toBe("2027-10-31T04:00:00.000Z");
  });

  it("runs once at the jump when the local time does not exist", () => {
    // 02:30 is skipped on 28 March 2027 in Amsterdam (02:00 -> 03:00).
    const run = nextRunAfter(new Date("2027-03-27T12:00:00Z"), "02:30", "Europe/Amsterdam");
    expect(run.getTime()).toBeGreaterThan(new Date("2027-03-28T00:00:00Z").getTime());
    expect(run.getTime()).toBeLessThan(new Date("2027-03-28T02:00:00Z").getTime());
    const following = nextRunAfter(run, "02:30", "Europe/Amsterdam");
    expect(iso(following)).toBe("2027-03-29T00:30:00.000Z");
  });

  it("handles zones on the other side of the date line and half-hour offsets", () => {
    expect(iso(nextRunAfter(new Date("2027-01-15T12:00:00Z"), "07:30", "Pacific/Auckland"))).toBe(
      "2027-01-15T18:30:00.000Z",
    );
    expect(iso(nextRunAfter(new Date("2027-01-15T12:00:00Z"), "09:00", "Asia/Kolkata"))).toBe(
      "2027-01-16T03:30:00.000Z",
    );
    expect(iso(nextRunAfter(new Date("2027-12-31T23:30:00Z"), "00:15", "UTC"))).toBe("2028-01-01T00:15:00.000Z");
  });

  it("rejects malformed times and zones", () => {
    expect(() => nextRunAfter(new Date(), "25:00", "UTC")).toThrow(/Invalid schedule time/);
    expect(() => nextRunAfter(new Date(), "05:00", "Nowhere/City")).toThrow(/Invalid time zone/);
  });
});

describe("due and missed runs", () => {
  const hour = 60 * 60 * 1000;
  const slot = new Date("2027-01-15T04:00:00Z");

  it("is not due before the slot", () => {
    expect(decideDue(slot, new Date("2027-01-15T03:59:59Z"), 12 * hour)).toBe("not_due");
    expect(decideDue(null, new Date(), 12 * hour)).toBe("not_due");
  });

  it("runs a slot that is due, including one missed while the server slept", () => {
    expect(decideDue(slot, new Date("2027-01-15T04:00:00Z"), 12 * hour)).toBe("run");
    expect(decideDue(slot, new Date("2027-01-15T09:30:00Z"), 12 * hour)).toBe("run");
  });

  it("skips a slot missed by more than the catch-up window", () => {
    expect(decideDue(slot, new Date("2027-01-16T03:00:00Z"), 12 * hour)).toBe("missed");
  });
});
