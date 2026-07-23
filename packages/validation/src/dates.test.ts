import { describe, expect, it } from "vitest";
import { calculateNextRefillDate, parseImportDate } from "./dates";

describe("parseImportDate", () => {
  it("parses DD/MM/YYYY", () => {
    expect(parseImportDate("06/05/2026", "DD/MM/YYYY").isoDate).toBe("2026-05-06");
  });

  it("parses MM/DD/YYYY", () => {
    expect(parseImportDate("05/06/2026", "MM/DD/YYYY").isoDate).toBe("2026-05-06");
  });

  it("rejects impossible dates", () => {
    expect(parseImportDate("31/02/2026", "DD/MM/YYYY").valid).toBe(false);
  });

  it("expands 2-digit years as seen in the real cash_leads.xlsx/med_gulf_sample.xlsx dates", () => {
    // cash_leads.xlsx renders its Date column as "5/6/26"; med_gulf_sample.xlsx
    // renders CLAIMDATE/SERVICEDATE as "4/14/26" - both 2-digit years. Without
    // expansion this silently parsed as year 26 AD instead of 2026.
    expect(parseImportDate("5/6/26", "DD/MM/YYYY").isoDate).toBe("2026-06-05");
    expect(parseImportDate("4/14/26", "MM/DD/YYYY").isoDate).toBe("2026-04-14");
  });
});

describe("calculateNextRefillDate", () => {
  it("adds refill period days", () => {
    expect(calculateNextRefillDate("2026-05-06", 30)).toBe("2026-06-05");
  });

  it("rejects out-of-range refill periods", () => {
    expect(() => calculateNextRefillDate("2026-05-06", 10)).toThrow();
    expect(() => calculateNextRefillDate("2026-05-06", 90)).toThrow();
  });
});
