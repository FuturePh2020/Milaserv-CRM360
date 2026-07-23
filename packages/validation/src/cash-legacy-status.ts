/**
 * Cash lead legacy "Status" column mapping (spec §9.4). This maps the raw
 * legacy text to a disposition value purely for reporting/reference - it is
 * NOT applied as the new Lead's status on import. A freshly imported lead
 * always starts AVAILABLE (see cash.processor.ts for the rationale): there is
 * no real LeadAssignment/CallAttempt in this system behind the legacy text,
 * so treating "Reschedule call" as FOLLOW_UP_SCHEDULED or "No Answer or Busy"
 * as CALLBACK_ELIGIBLE would fabricate assignment-shaped history that never
 * happened here. sourceStatusRaw preserves the original text unconditionally.
 */
export type CashLegacyMappedDisposition =
  | "ANSWERED_NO_ORDER"
  | "NO_ANSWER_BUSY"
  | "RESCHEDULE_FOLLOW_UP"
  | null;

const CASH_LEGACY_STATUS_MAP: Record<string, CashLegacyMappedDisposition> = {
  "Answered - No Order": "ANSWERED_NO_ORDER",
  "No Answer or Busy": "NO_ANSWER_BUSY",
  "Reschedule call": "RESCHEDULE_FOLLOW_UP",
};

export function mapCashLegacyStatus(raw: string | null | undefined): CashLegacyMappedDisposition {
  if (!raw || raw.trim() === "") return null;
  return CASH_LEGACY_STATUS_MAP[raw.trim()] ?? null;
}

/**
 * Splits a legacy "Agent" column value like "Mohamed Taman (7049)" into a
 * display name and extension. Returns the raw string as the name (trimmed)
 * when no extension pattern is found - the raw value is always preserved by
 * the caller regardless of whether this parses cleanly.
 */
export interface ParsedLegacyAgent {
  name: string | null;
  extension: string | null;
}

export function parseLegacyAgentLabel(raw: string | null | undefined): ParsedLegacyAgent {
  if (!raw || raw.trim() === "") return { name: null, extension: null };
  const match = raw.trim().match(/^(.*?)\s*\((\d+)\)\s*$/);
  if (match) {
    return { name: match[1].trim(), extension: match[2] };
  }
  return { name: raw.trim(), extension: null };
}
