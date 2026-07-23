/**
 * Explicit-format date parsing for imports. Never guesses locale.
 */
export type ImportDateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

export interface DateParseResult {
  raw: string;
  isoDate: string | null; // UTC midnight ISO date, application converts to Africa/Cairo for display
  valid: boolean;
}

export function parseImportDate(input: string, format: ImportDateFormat): DateParseResult {
  const raw = String(input).trim();
  if (!raw) return { raw, isoDate: null, valid: false };

  const parts = raw.split(/[/\-.]/).map((p) => p.trim());
  if (parts.length !== 3) return { raw, isoDate: null, valid: false };

  let day: number, month: number, year: number;

  if (format === "DD/MM/YYYY") {
    [day, month, year] = parts.map(Number);
  } else if (format === "MM/DD/YYYY") {
    [month, day, year] = parts.map(Number);
  } else {
    [year, month, day] = parts.map(Number);
  }

  if (!day || !month || !year || month < 1 || month > 12 || day < 1 || day > 31) {
    return { raw, isoDate: null, valid: false };
  }

  // The real sample files (cash_leads.xlsx, med_gulf_sample.xlsx) render dates
  // with 2-digit years (e.g. "5/6/26"). Without expansion, Date.UTC(26, ...)
  // silently produces the year 26 AD instead of 2026 - caught via live testing
  // against the actual sample data, not a hypothetical.
  if (year < 100) {
    year += 2000;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) {
    return { raw, isoDate: null, valid: false }; // e.g. day 31 in a 30-day month
  }

  return { raw, isoDate: date.toISOString().slice(0, 10), valid: true };
}

/**
 * Legacy "days to dispense" import values (e.g. "46225 Days Overdue") must never be trusted.
 * Days-to-dispense is always derived from actual date fields at read time.
 */
export function calculateNextRefillDate(lastDispenseIsoDate: string, refillPeriodDays: number): string {
  if (refillPeriodDays < 26 || refillPeriodDays > 80) {
    throw new Error("refillPeriodDays must be between 26 and 80");
  }
  const date = new Date(`${lastDispenseIsoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + refillPeriodDays);
  return date.toISOString().slice(0, 10);
}
