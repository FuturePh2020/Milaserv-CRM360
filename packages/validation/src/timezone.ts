/**
 * All timestamps are stored in UTC. Display/attendance-day boundaries are
 * always Africa/Cairo, per spec. This is the one place that conversion
 * happens so session/break/attendance code can't drift on which timezone
 * "today" means.
 */
export const DISPLAY_TIMEZONE = "Africa/Cairo";

const cairoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Returns the Africa/Cairo calendar date (YYYY-MM-DD) for a UTC instant. */
export function toCairoDateString(date: Date): string {
  return cairoDateFormatter.format(date);
}

/** Africa/Cairo calendar date (YYYY-MM-DD) for "now". */
export function todayInCairo(): string {
  return toCairoDateString(new Date());
}
