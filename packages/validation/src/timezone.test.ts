import { describe, expect, it } from "vitest";
import { toCairoDateString } from "./timezone";

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
