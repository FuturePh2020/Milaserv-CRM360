import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { hashRow, parseSpreadsheet } from "./sheet";

const samplesDir = join(__dirname, "../../../docs/samples");

describe("parseSpreadsheet", () => {
  it("reads cash_leads.xlsx headers and rows", () => {
    const buffer = readFileSync(join(samplesDir, "cash_leads.xlsx"));
    const parsed = parseSpreadsheet(buffer);

    expect(parsed.headers).toEqual(
      expect.arrayContaining([
        "Agent",
        "Mobile Number",
        "Date",
        "Branch",
        "City",
        "Medication",
        "Quantity",
        "Price",
        "Status",
      ]),
    );
    expect(parsed.rows.length).toBeGreaterThan(0);
  });

  it("preserves row position across blank rows so source row numbers stay accurate", () => {
    // cash_leads.xlsx has a real A1:L29 range: a header row, then data rows,
    // then six fully-blank rows, then one more row with a single stray value.
    // A naive sheet_to_json call silently drops the blank rows, which would
    // desync any index-based "source row number" from the true spreadsheet
    // row for everything after the gap - caught via live testing in this
    // session and fixed with the `blankrows: true` option in parseSpreadsheet.
    const buffer = readFileSync(join(samplesDir, "cash_leads.xlsx"));
    const parsed = parseSpreadsheet(buffer);

    expect(parsed.rows).toHaveLength(28); // 29 total rows minus the header row
    const lastRow = parsed.rows[parsed.rows.length - 1];
    expect(lastRow["Days to dispense"]).toBe("Column1");
    expect(lastRow["Mobile Number"]).toBeNull();
  });

  it("reads med_gulf_sample.xlsx headers and rows", () => {
    const buffer = readFileSync(join(samplesDir, "med_gulf_sample.xlsx"));
    const parsed = parseSpreadsheet(buffer);

    expect(parsed.headers).toEqual(
      expect.arrayContaining([
        "Phone Number",
        "claim_seq_id",
        "inv_item_idm",
        "NATIONALID",
        "INVOICENO",
        "Medicine",
      ]),
    );
    expect(parsed.rows.length).toBeGreaterThan(0);
  });
});

describe("hashRow", () => {
  it("is stable regardless of key order", () => {
    const a = hashRow({ a: 1, b: 2 });
    const b = hashRow({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("differs for different content", () => {
    expect(hashRow({ a: 1 })).not.toBe(hashRow({ a: 2 }));
  });
});
