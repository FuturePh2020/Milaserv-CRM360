/**
 * Deterministic lead/item grouping keys, per spec §8.1/§8.2 (Insurance) and
 * §9.1 (Cash). Pure functions so the exact fallback precedence is unit
 * testable without a database.
 */

export function buildCashGroupKey(phoneNormalized: string, isoDate: string, branchCode: string): string {
  return `CASH|${phoneNormalized}|${isoDate}|${branchCode}`;
}

export interface InsuranceGroupKeyInput {
  nationalId: string | null;
  claimSequenceId: string | null;
  phoneNormalized: string;
  invoiceNo: string | null;
  serviceDateIso: string | null;
}

/** Preferred: NATIONALID + claim_seq_id. Fallback: phone + INVOICENO + SERVICEDATE. */
export function buildInsuranceGroupKey(input: InsuranceGroupKeyInput): string {
  if (input.nationalId && input.claimSequenceId) {
    return `INSURANCE|${input.nationalId}|${input.claimSequenceId}`;
  }
  return `INSURANCE|FALLBACK|${input.phoneNormalized}|${input.invoiceNo ?? ""}|${input.serviceDateIso ?? ""}`;
}

export interface InsuranceItemKeyInput {
  invoiceItemKey: string | null; // inv_item_idm
  claimSequenceId: string | null;
  itemCode: string | null; // code
}

/** Preferred: inv_item_idm. Fallback: claim_seq_id + code. */
export function buildInsuranceItemKey(input: InsuranceItemKeyInput): string {
  if (input.invoiceItemKey) return input.invoiceItemKey;
  return `${input.claimSequenceId ?? ""}_${input.itemCode ?? ""}`;
}
