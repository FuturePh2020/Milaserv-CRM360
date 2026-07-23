/**
 * Required source columns per import type, from the Data Mapping workbook
 * and docs/specifications/MILASERV_CRM360_MVP.md §8.3/§9.2/§16.1. This is
 * structural "is the column present and non-empty" validation only (import
 * step 6) - grouping/normalization semantics (step 9) are implemented by the
 * per-type parser in Phase 3.
 */
export const REQUIRED_COLUMNS_BY_SOURCE_TYPE = {
  CASH: ["Mobile Number", "Date", "Branch", "Medication", "Quantity"],
  INSURANCE: [
    "Phone Number",
    "claim_seq_id",
    "CLAIMDATE",
    "SERVICEDATE",
    "code",
    "FULLNAME",
    "inv_item_idm",
    "INVOICENO",
    "NATIONALID",
    "QTY",
    "storeid",
  ],
  CDR: [
    "ID",
    "Time",
    "Call From",
    "Call To",
    "Call Duration",
    "Ring Duration",
    "Talk Duration",
    "Status",
    "Communication Type",
  ],
} as const;

export type ImportSourceTypeKey = keyof typeof REQUIRED_COLUMNS_BY_SOURCE_TYPE;

export function findMissingRequiredColumns(sourceType: ImportSourceTypeKey, headers: string[]): string[] {
  const required = REQUIRED_COLUMNS_BY_SOURCE_TYPE[sourceType];
  const headerSet = new Set(headers.map((h) => h.trim()));
  return required.filter((column) => !headerSet.has(column));
}

export function findEmptyRequiredFields(
  sourceType: ImportSourceTypeKey,
  row: Record<string, unknown>,
): string[] {
  const required = REQUIRED_COLUMNS_BY_SOURCE_TYPE[sourceType];
  return required.filter((column) => {
    const value = row[column];
    return value === null || value === undefined || String(value).trim() === "";
  });
}
