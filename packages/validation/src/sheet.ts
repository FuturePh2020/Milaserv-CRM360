import { createHash } from "crypto";
import * as XLSX from "xlsx";

export type SheetRow = Record<string, unknown>;

export interface ParsedSheet {
  sheetName: string;
  headers: string[];
  rows: SheetRow[];
}

/**
 * Reads the first sheet of an uploaded XLSX/XLS/CSV file into header-keyed
 * row objects. This is the one place both the API (preview) and the worker
 * (commit) read spreadsheet bytes, so preview and commit can never silently
 * disagree about what a row contains.
 */
export function parseSpreadsheet(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { sheetName: "", headers: [], rows: [] };
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, {
    defval: null,
    raw: false,
    // Without this, sheet_to_json silently omits fully-blank rows, which
    // desyncs any row-index-based source row number from the real
    // spreadsheet row the moment a file has a blank row in the middle
    // (confirmed against docs/samples/cash_leads.xlsx, which has six).
    blankrows: true,
  });

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { sheetName, headers, rows };
}

/**
 * Deterministic hash of a raw source row, used to detect duplicate rows
 * within the same file (as distinct from "already imported in a previous
 * batch", which is a business-grouping-key concern owned by the per-source
 * parser, not this generic framework).
 */
export function hashRow(row: SheetRow): string {
  const normalized = JSON.stringify(row, Object.keys(row).sort());
  return createHash("sha256").update(normalized).digest("hex");
}
