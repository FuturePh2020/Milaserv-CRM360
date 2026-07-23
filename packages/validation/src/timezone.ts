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

/**
 * Offset (in minutes, UTC minus local) that `timeZone` observes at `instant`.
 * Uses the IANA tz database via Intl, so it is correct across DST
 * transitions for zones that have them - not just fixed-offset zones.
 */
function getTimezoneOffsetMinutes(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - instant.getTime()) / 60000;
}

/**
 * Converts a "wall clock" date/time as observed in `timeZone` into the UTC
 * instant it represents. Used for CDR import, where "Time" is a local
 * timestamp in whatever timezone the PBX is configured for (an Admin
 * setting, spec section 16.4) - never assumed to already be UTC or Cairo.
 * Two-pass correction handles the (rare) case where the offset itself
 * changes between the naive guess and the corrected instant (DST edges).
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
  second = 0,
): Date {
  const naiveUtcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMinutes = getTimezoneOffsetMinutes(naiveUtcGuess, timeZone);
  const corrected = new Date(naiveUtcGuess.getTime() - offsetMinutes * 60000);
  const refinedOffset = getTimezoneOffsetMinutes(corrected, timeZone);
  return new Date(naiveUtcGuess.getTime() - refinedOffset * 60000);
}

/**
 * Parses the Yeastar CDR "Time" column, D/M/YYYY 24-hour clock, interpreted
 * in the given source timezone. The real sample file
 * (docs/samples/yeastar_cdr_sample.xls) mixes two variants for the same
 * column - most rows omit seconds ("8/2/2026 13:32") but ~23% include them
 * ("13/02/2026 16:16:36") - so seconds are optional, not assumed absent.
 */
export function parseCdrTimestamp(raw: string, sourceTimezone: string): Date | null {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = secondStr ? Number(secondStr) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  return zonedWallTimeToUtc(year, month, day, hour, minute, sourceTimezone, second);
}
