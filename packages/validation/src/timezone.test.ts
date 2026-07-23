import { describe, expect, it } from "vitest";
import { parseCdrTimestamp, toCairoDateString, zonedWallTimeToUtc } from "./timezone";

describe("toCairoDateString", () => {
  it("converts a UTC instant to the Africa/Cairo calendar date", () => {
    // 2026-01-01T21:30:00Z is 2026-01-01T23:30 in Africa/Cairo (UTC+2) - same day.
    expect(toCairoDateString(new Date("2026-01-01T21:30:00Z"))).toBe("2026-01-01");
  });

  it("rolls over to the next Cairo day after 22:00 UTC", () => {
    // 2026-01-01T22:30:00Z is 2026-01-02T00:30 in Africa/Cairo - next day.
    expect(toCairoDateString(new Date("2026-01-01T22:30:00Z"))).toBe("2026-01-02");
  });
});

describe("zonedWallTimeToUtc", () => {
  it("converts an Asia/Riyadh (fixed UTC+3) wall clock time to UTC", () => {
    const result = zonedWallTimeToUtc(2026, 2, 8, 13, 32, "Asia/Riyadh");
    expect(result.toISOString()).toBe("2026-02-08T10:32:00.000Z");
  });

  it("converts an Africa/Cairo wall clock time to UTC", () => {
    // Africa/Cairo is UTC+2 in this period.
    const result = zonedWallTimeToUtc(2026, 1, 1, 12, 0, "Africa/Cairo");
    expect(result.toISOString()).toBe("2026-01-01T10:00:00.000Z");
  });
});

describe("parseCdrTimestamp", () => {
  it("parses the real Yeastar CDR 'Time' column format in the configured source timezone", () => {
    // Real sample values: "8/2/2026 13:32" and "11/2/2026 8:58" (D/M/YYYY H:mm).
    const result = parseCdrTimestamp("8/2/2026 13:32", "Asia/Riyadh");
    expect(result?.toISOString()).toBe("2026-02-08T10:32:00.000Z");
  });

  it("rejects an unparseable value rather than guessing", () => {
    expect(parseCdrTimestamp("not a date", "Asia/Riyadh")).toBeNull();
  });

  it("parses the seconds-included variant seen in ~23% of real sample rows", () => {
    // Real sample value: "13/02/2026 16:16:36" (D/M/YYYY H:mm:ss, zero-padded).
    const result = parseCdrTimestamp("13/02/2026 16:16:36", "Asia/Riyadh");
    expect(result?.toISOString()).toBe("2026-02-13T13:16:36.000Z");
  });

  it("rejects an out-of-range seconds value", () => {
    expect(parseCdrTimestamp("13/02/2026 16:16:60", "Asia/Riyadh")).toBeNull();
  });
});
