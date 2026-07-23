import { describe, expect, it } from "vitest";
import { parseCdrEndpoint } from "./cdr-endpoint";

describe("parseCdrEndpoint", () => {
  it("parses a human agent endpoint", () => {
    const result = parseCdrEndpoint("Abdelmagied Ali<7033>\t");
    expect(result).toMatchObject({ name: "Abdelmagied Ali", extension: "7033", isSystemEndpoint: false });
  });

  it("classifies IVR endpoints as system, not Agent - real sample string", () => {
    const result = parseCdrEndpoint("IVR Duty Hours - AR_EN<6234>\t");
    expect(result.isSystemEndpoint).toBe(true);
    expect(result.extension).toBe("6234");
  });

  it("classifies Queue endpoints as system", () => {
    expect(parseCdrEndpoint("Queue Tele<5000>").isSystemEndpoint).toBe(true);
    expect(parseCdrEndpoint("Queue CC<5001>").isSystemEndpoint).toBe(true);
  });

  it("classifies Voicemail endpoints as system - real sample string", () => {
    const result = parseCdrEndpoint("Voicemail Mohamed Saad<1067>\t");
    expect(result.isSystemEndpoint).toBe(true);
  });

  it("parses a bare phone number as a customer endpoint", () => {
    const result = parseCdrEndpoint("0536366684\t");
    expect(result).toMatchObject({ name: null, extension: null, isPhoneNumberShaped: true });
  });
});
