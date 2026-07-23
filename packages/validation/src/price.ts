/**
 * Cash leads "Price" column parsing.
 * Handles raw numeric values and shorthand like "1.26K" => 1260.
 */
export interface PriceParseResult {
  raw: string;
  amount: number | null;
  valid: boolean;
}

export function parseCashPrice(input: string | number | null | undefined): PriceParseResult {
  if (input === null || input === undefined || input === "") {
    return { raw: "", amount: null, valid: false };
  }

  const raw = String(input).trim();

  if (typeof input === "number") {
    return { raw, amount: input, valid: true };
  }

  const kShorthand = raw.match(/^(-?\d+(?:\.\d+)?)\s*[kK]$/);
  if (kShorthand) {
    const amount = Math.round(parseFloat(kShorthand[1]) * 1000 * 100) / 100;
    return { raw, amount, valid: true };
  }

  const numeric = raw.replace(/,/g, "");
  const parsed = Number(numeric);
  if (!Number.isNaN(parsed)) {
    return { raw, amount: parsed, valid: true };
  }

  return { raw, amount: null, valid: false };
}
