import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { parseSpreadsheet } from "./sheet";
import { findEmptyRequiredFields, findMissingRequiredColumns } from "./import-columns";

const samplesDir = join(__dirname, "../../../docs/samples");

describe("findMissingRequiredColumns", () => {
  it("finds no missing columns for the real cash_leads.xlsx sample", () => {
    const { headers } = parseSpreadsheet(readFileSync(join(samplesDir, "cash_leads.xlsx")));
    expect(findMissingRequiredColumns("CASH", headers)).toEqual([]);
  });

  it("finds no missing columns for the real med_gulf_sample.xlsx sample", () => {
    const { headers } = parseSpreadsheet(readFileSync(join(samplesDir, "med_gulf_sample.xlsx")));
    expect(findMissingRequiredColumns("INSURANCE", headers)).toEqual([]);
  });

  it("flags a genuinely missing column", () => {
    expect(findMissingRequiredColumns("CASH", ["Mobile Number", "Date"])).toEqual(
      expect.arrayContaining(["Branch", "Medication", "Quantity"]),
    );
  });
});

describe("findEmptyRequiredFields", () => {
  it("flags a blank required field", () => {
    const row = { "Mobile Number": "0500020981", Date: "", Branch: "P440", Medication: "X", Quantity: 1 };
    expect(findEmptyRequiredFields("CASH", row)).toEqual(["Date"]);
  });

  it("passes when all required fields are present", () => {
    const row = {
      "Mobile Number": "0500020981",
      Date: "06/05/2026",
      Branch: "P440",
      Medication: "X",
      Quantity: 1,
    };
    expect(findEmptyRequiredFields("CASH", row)).toEqual([]);
  });
});
