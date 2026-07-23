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
