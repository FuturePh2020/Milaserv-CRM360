import { LeadStatus, LeadType, PrismaClient } from "@milaserv/database";
import {
  buildCashGroupKey,
  hashRow,
  normalizeSaudiPhone,
  parseCashPrice,
  parseImportDate,
  type ImportDateFormat,
} from "@milaserv/validation";

interface CashRow {
  id: string;
  sourceRowNumber: number;
  rawData: Record<string, unknown>;
}

export interface CashProcessingResult {
  groupsSeen: number;
  leadsCreated: number;
  leadsAlreadyExisted: number;
  itemsUpserted: number;
}

/**
 * Groups validated Cash import rows into Lead headers + LeadMedicationItem
 * children (spec §9.1) and creates them. Does not create leads from rows
 * whose phone/date fail to parse even though they passed the generic
 * structural (Phase 2) validation - those are recorded back as import
 * errors here, since only this processor knows the Cash-specific parsing
 * rules well enough to judge them invalid.
 */
export async function processCashRows(
  prisma: PrismaClient,
  batchId: string,
  dateFormat: ImportDateFormat,
): Promise<CashProcessingResult> {
  const rawRows = await prisma.leadImportRow.findMany({
    where: { batchId, isValid: true },
    select: { id: true, sourceRowNumber: true, rawData: true },
  });
  const rows: CashRow[] = rawRows.map((r) => ({
    ...r,
    rawData: (r.rawData ?? {}) as Record<string, unknown>,
  }));

  interface ParsedCashRow {
    row: CashRow;
    phoneNormalized: string;
    phoneRaw: string;
    isoDate: string;
    branchCode: string;
    city: string | null;
    legacyAgentLabel: string | null;
    sourceStatusRaw: string | null;
    medicationName: string;
    quantity: number;
    priceRaw: string | null;
    priceAmount: number | null;
  }

  const parsedRows: ParsedCashRow[] = [];

  for (const row of rows) {
    const data = row.rawData;
    const phoneRawValue = String(data["Mobile Number"] ?? "").trim();
    const phone = normalizeSaudiPhone(phoneRawValue);
    const dateValue = String(data["Date"] ?? "").trim();
    const parsedDate = parseImportDate(dateValue, dateFormat);
    const branchCode = String(data["Branch"] ?? "").trim();
    const medicationName = String(data["Medication"] ?? "").trim();

    if (!phone.valid || !parsedDate.valid || !branchCode || !medicationName) {
      await prisma.leadImportError.create({
        data: {
          batchId,
          rowId: row.id,
          sourceRowNumber: row.sourceRowNumber,
          errorCode: "CASH_PARSE_FAILED",
          errorMessage: `Could not parse phone/date/branch/medication for row ${row.sourceRowNumber}.`,
        },
      });
      continue;
    }

    const price = parseCashPrice(data["Price"] as string | number | null | undefined);

    parsedRows.push({
      row,
      phoneNormalized: phone.normalized as string,
      phoneRaw: phoneRawValue,
      isoDate: parsedDate.isoDate as string,
      branchCode,
      city: data["City"] ? String(data["City"]).trim() : null,
      legacyAgentLabel: data["Agent"] ? String(data["Agent"]).trim() : null,
      sourceStatusRaw: data["Status"] ? String(data["Status"]).trim() : null,
      medicationName,
      quantity: Number(data["Quantity"] ?? 0),
      priceRaw: price.raw || null,
      priceAmount: price.amount,
    });
  }

  const groups = new Map<string, ParsedCashRow[]>();
  for (const parsed of parsedRows) {
    const groupKey = buildCashGroupKey(parsed.phoneNormalized, parsed.isoDate, parsed.branchCode);
    const existing = groups.get(groupKey);
    if (existing) existing.push(parsed);
    else groups.set(groupKey, [parsed]);
  }

  let leadsCreated = 0;
  let leadsAlreadyExisted = 0;
  let itemsUpserted = 0;

  for (const [groupKey, groupRows] of groups) {
    const first = groupRows[0];

    await prisma.$transaction(async (tx) => {
      let person = await tx.person.findFirst({ where: { phoneNormalized: first.phoneNormalized } });
      if (!person) {
        person = await tx.person.create({
          data: { phoneRaw: first.phoneRaw, phoneNormalized: first.phoneNormalized },
        });
      }

      let lead = await tx.lead.findFirst({ where: { groupKey, type: LeadType.CASH } });
      if (!lead) {
        lead = await tx.lead.create({
          data: {
            type: LeadType.CASH,
            status: LeadStatus.AVAILABLE,
            personId: person.id,
            batchId,
            branchCode: first.branchCode,
            city: first.city,
            groupKey,
            sourceLeadDate: new Date(`${first.isoDate}T00:00:00.000Z`),
            legacyAgentLabel: first.legacyAgentLabel,
            sourceStatusRaw: first.sourceStatusRaw,
            sourceOrder: Math.min(...groupRows.map((r) => r.row.sourceRowNumber)),
          },
        });
        await tx.leadStatusHistory.create({
          data: { leadId: lead.id, fromStatus: null, toStatus: LeadStatus.AVAILABLE, reason: "IMPORTED" },
        });
        leadsCreated++;
      } else {
        leadsAlreadyExisted++;
      }

      for (const parsed of groupRows) {
        const sourceItemKey = hashRow(parsed.row.rawData);
        await tx.leadMedicationItem.upsert({
          where: { leadId_sourceItemKey: { leadId: lead.id, sourceItemKey } },
          update: {},
          create: {
            leadId: lead.id,
            sourceItemKey,
            medicationName: parsed.medicationName,
            quantity: parsed.quantity,
            priceRaw: parsed.priceRaw,
            priceAmount: parsed.priceAmount,
          },
        });
        itemsUpserted++;

        await tx.leadImportRow.update({ where: { id: parsed.row.id }, data: { leadId: lead.id, groupKey } });
      }
    });
  }

  return { groupsSeen: groups.size, leadsCreated, leadsAlreadyExisted, itemsUpserted };
}
