import { describe, expect, it } from "vitest";
import { buildCashGroupKey, buildInsuranceGroupKey, buildInsuranceItemKey } from "./grouping-keys";

describe("buildCashGroupKey", () => {
  it("groups repeated medication rows for the same phone/date/branch", () => {
    const a = buildCashGroupKey("966500210989", "2026-05-06", "P440");
    const b = buildCashGroupKey("966500210989", "2026-05-06", "P440");
    expect(a).toBe(b);
  });

  it("separates different branches for the same phone/date", () => {
    const a = buildCashGroupKey("966500210989", "2026-05-06", "P440");
    const b = buildCashGroupKey("966500210989", "2026-05-06", "D075");
    expect(a).not.toBe(b);
  });
});

describe("buildInsuranceGroupKey", () => {
  it("prefers NATIONALID + claim_seq_id", () => {
    const key = buildInsuranceGroupKey({
      nationalId: "2054223520",
      claimSequenceId: "260414140145010045",
      phoneNormalized: "966500020981",
      invoiceNo: "44136475",
      serviceDateIso: "2026-04-14",
    });
    expect(key).toBe("INSURANCE|2054223520|260414140145010045");
  });

  it("falls back to phone + invoice + service date when identity fields are missing", () => {
    const key = buildInsuranceGroupKey({
      nationalId: null,
      claimSequenceId: null,
      phoneNormalized: "966500020981",
      invoiceNo: "44136475",
      serviceDateIso: "2026-04-14",
    });
    expect(key).toBe("INSURANCE|FALLBACK|966500020981|44136475|2026-04-14");
  });
});

describe("buildInsuranceItemKey", () => {
  it("prefers inv_item_idm", () => {
    expect(
      buildInsuranceItemKey({
        invoiceItemKey: "260414140145010045_202308",
        claimSequenceId: "260414140145010045",
        itemCode: "202308",
      }),
    ).toBe("260414140145010045_202308");
  });

  it("falls back to claim_seq_id + code", () => {
    expect(
      buildInsuranceItemKey({ invoiceItemKey: null, claimSequenceId: "260414140145010045", itemCode: "202308" }),
    ).toBe("260414140145010045_202308");
  });
});
