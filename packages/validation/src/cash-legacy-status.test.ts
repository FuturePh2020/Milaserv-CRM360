import { describe, expect, it } from "vitest";
import { mapCashLegacyStatus, parseLegacyAgentLabel } from "./cash-legacy-status";

describe("mapCashLegacyStatus", () => {
  it("maps the exact legacy strings from the real sample file", () => {
    expect(mapCashLegacyStatus("Answered - No Order")).toBe("ANSWERED_NO_ORDER");
    expect(mapCashLegacyStatus("No Answer or Busy")).toBe("NO_ANSWER_BUSY");
    expect(mapCashLegacyStatus("Reschedule call")).toBe("RESCHEDULE_FOLLOW_UP");
  });

  it("maps blank/missing status to null (-> AVAILABLE)", () => {
    expect(mapCashLegacyStatus(null)).toBeNull();
    expect(mapCashLegacyStatus("")).toBeNull();
    expect(mapCashLegacyStatus("   ")).toBeNull();
  });

  it("maps unrecognized status to null rather than guessing", () => {
    expect(mapCashLegacyStatus("Some new status nobody has seen")).toBeNull();
  });
});

describe("parseLegacyAgentLabel", () => {
  it("splits the real sample format 'Name (ext)'", () => {
    expect(parseLegacyAgentLabel("Mohamed Taman (7049)")).toEqual({
      name: "Mohamed Taman",
      extension: "7049",
    });
  });

  it("falls back to the raw string as the name when there's no extension", () => {
    expect(parseLegacyAgentLabel("Just A Name")).toEqual({ name: "Just A Name", extension: null });
  });

  it("returns nulls for blank input", () => {
    expect(parseLegacyAgentLabel(null)).toEqual({ name: null, extension: null });
    expect(parseLegacyAgentLabel("")).toEqual({ name: null, extension: null });
  });
});
