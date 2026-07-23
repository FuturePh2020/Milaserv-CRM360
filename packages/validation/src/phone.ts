/**
 * Saudi mobile phone normalization.
 * Canonical form: 9665XXXXXXXX (12 digits, country code 966 + 5XXXXXXXX).
 */

export interface PhoneNormalizationResult {
  raw: string;
  normalized: string | null;
  valid: boolean;
}

const SAUDI_LOCAL_LENGTH = 9; // 5XXXXXXXX
const SAUDI_COUNTRY_CODE = "966";

export function normalizeSaudiPhone(input: string): PhoneNormalizationResult {
  const raw = input;
  const digitsOnly = input.replace(/[^\d]/g, "").trim();

  if (!digitsOnly) {
    return { raw, normalized: null, valid: false };
  }

  let local: string | null = null;

  if (digitsOnly.startsWith("00966")) {
    local = digitsOnly.slice(5);
  } else if (digitsOnly.startsWith("966")) {
    local = digitsOnly.slice(3);
  } else if (digitsOnly.startsWith("05")) {
    local = digitsOnly.slice(1);
  } else if (digitsOnly.startsWith("5") && digitsOnly.length === SAUDI_LOCAL_LENGTH) {
    local = digitsOnly;
  } else if (digitsOnly.length === SAUDI_LOCAL_LENGTH && digitsOnly.startsWith("5")) {
    local = digitsOnly;
  } else {
    local = null;
  }

  if (!local || local.length !== SAUDI_LOCAL_LENGTH || !local.startsWith("5")) {
    return { raw, normalized: null, valid: false };
  }

  const normalized = `${SAUDI_COUNTRY_CODE}${local}`;
  return { raw, normalized, valid: true };
}

export function maskPhone(normalized: string): string {
  if (normalized.length < 6) return "****";
  return `${normalized.slice(0, 5)}****${normalized.slice(-2)}`;
}

/**
 * Generic masking for other long identifiers (national id, insurance
 * identifiers) shown in Agent-facing search results. Keeps only the last 3
 * characters visible - never enough to identify the person from the masked
 * value alone.
 */
export function maskIdentifier(value: string): string {
  if (value.length <= 3) return "*".repeat(value.length);
  return `${"*".repeat(value.length - 3)}${value.slice(-3)}`;
}
