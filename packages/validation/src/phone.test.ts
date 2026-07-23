import { describe, expect, it } from "vitest";
import { maskIdentifier, maskPhone, normalizeSaudiPhone } from "./phone";

describe("normalizeSaudiPhone", () => {
  it.each([
    ["0500020981", "966500020981"],
    ["500020981", "966500020981"],
    ["966500020981", "966500020981"],
    ["+966500020981", "966500020981"],
    ["500020981", "966500020981"], // sample 9-digit form from cash_leads.xlsx
    ["+966 50 002 0981", "966500020981"],
    ["00966500020981", "966500020981"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeSaudiPhone(input).normalized).toBe(expected);
  });

  it("rejects invalid input", () => {
    expect(normalizeSaudiPhone("123").valid).toBe(false);
    expect(normalizeSaudiPhone("").valid).toBe(false);
    expect(normalizeSaudiPhone("966400020981").valid).toBe(false); // not starting with 5 after country code
  });
});

describe("maskPhone", () => {
  it("keeps prefix and last two digits only", () => {
    expect(maskPhone("966500020981")).toBe("96650****81");
  });
});

describe("maskIdentifier", () => {
  it("keeps only the last 3 characters visible", () => {
    expect(maskIdentifier("2054223520")).toBe("*******520");
  });

  it("fully masks short values", () => {
    expect(maskIdentifier("ab")).toBe("**");
  });
});
