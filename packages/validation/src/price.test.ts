import { describe, expect, it } from "vitest";
import { parseCashPrice } from "./price";

describe("parseCashPrice", () => {
  it("parses K shorthand", () => {
    expect(parseCashPrice("1.26K").amount).toBe(1260);
  });

  it("parses plain numbers", () => {
    expect(parseCashPrice(0).amount).toBe(0);
    expect(parseCashPrice("120").amount).toBe(120);
  });

  it("retains raw value", () => {
    expect(parseCashPrice("1.26K").raw).toBe("1.26K");
  });

  it("flags invalid values", () => {
    expect(parseCashPrice("N/A").valid).toBe(false);
  });
});
