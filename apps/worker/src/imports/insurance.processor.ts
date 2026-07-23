import { LeadStatus, LeadType, PrismaClient } from "@milaserv/database";
import {
  buildInsuranceGroupKey,
  buildInsuranceItemKey,
  normalizeSaudiPhone,
  parseImportDate,
  type ImportDateFormat,
} from "@milaserv/validation";

interface InsuranceRow {
  id: string;
  sourceRowNumber: number;
  rawData: Record<string, unknown>;
}

export interface InsuranceProcessingResult {
  groupsSeen: number;
  leadsCreated: number;
  leadsAlreadyExisted: number;
  itemsUpserted: number;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Groups validated Insurance import rows (item-level, per spec §8) into Lead
 * headers + LeadMedicationItem children. Long identifiers (national id,
 * claim/invoice/policy numbers, item keys) are kept as strings throughout -
 * never parsed as numbers - per the non-negotiable rule in CLAUDE.md.
 */
export async function processInsuranceRows(
  prisma: PrismaClient,
  batchId: string,
  dateFormat: ImportDateFormat,
): Promise<InsuranceProcessingResult> {
  const rawRows = await prisma.leadImportRow.findMany({
    where: { batchId, isValid: true },
    select: { id: true, sourceRowNumber: true, rawData: true },
  });
  const rows: InsuranceRow[] = rawRows.map((r) => ({
    ...r,
    rawData: (r.rawData ?? {}) as Record<string, unknown>,
  }));

  interface ParsedInsuranceRow {
    row: InsuranceRow;
    phoneNormalized: string;
    phoneRaw: string;
    nationalId: string | null;
    claimSequenceId: string | null;
    claimDateIso: string | null;
    serviceDateIso: string | null;
    appReferenceNo: string | null;
    invoiceNo: string | null;
    payerId: string | null;
    policyNo: string | null;
    preauthReferenceNo: string | null;
    memberClass: string | null;
    transactionNo: string | null;
    fullName: string | null;
    gender: string | null;
    branchCode: string | null;
    invoiceItemKey: string | null;
    itemCode: string | null;
    medicationName: string;
    quantity: number;
    serviceCode: string | null;
    upcCode: string | null;
    unitServicePrice: number | null;
    patientShareTotal: number | null;
    payerTaxShare: number | null;
  }

  const parsedRows: ParsedInsuranceRow[] = [];

  for (const row of rows) {
    const data = row.rawData;
    const phoneRawValue = String(data["Phone Number"] ?? "").trim();
    const phone = normalizeSaudiPhone(phoneRawValue);
    const medicationName = String(data["Medicine"] ?? "").trim();
    const claimDate = parseImportDate(String(data["CLAIMDATE"] ?? ""), dateFormat);
    const serviceDate = parseImportDate(String(data["SERVICEDATE"] ?? ""), dateFormat);

    if (!phone.valid || !medicationName) {
      await prisma.leadImportError.create({
        data: {
          batchId,
          rowId: row.id,
          sourceRowNumber: row.sourceRowNumber,
          errorCode: "INSURANCE_PARSE_FAILED",
          errorMessage: `Could not parse phone/medication for row ${row.sourceRowNumber}.`,
        },
      });
      continue;
    }

    parsedRows.push({
      row,
      phoneNormalized: phone.normalized as string,
      phoneRaw: phoneRawValue,
      nationalId: stringOrNull(data["NATIONALID"]),
      claimSequenceId: stringOrNull(data["claim_seq_id"]),
      claimDateIso: claimDate.valid ? claimDate.isoDate : null,
      serviceDateIso: serviceDate.valid ? serviceDate.isoDate : null,
      appReferenceNo: stringOrNull(data["APPREFNO"]),
      invoiceNo: stringOrNull(data["INVOICENO"]),
      payerId: stringOrNull(data["PayerId"]),
      policyNo: stringOrNull(data["POLICYNO"]),
      preauthReferenceNo: stringOrNull(data["preAuthRefNo"]),
      memberClass: stringOrNull(data["Class"]),
      transactionNo: stringOrNull(data["transno"]),
      fullName: stringOrNull(data["FULLNAME"]),
      gender: stringOrNull(data["GENDER"]),
      branchCode: stringOrNull(data["storeid"]),
      invoiceItemKey: stringOrNull(data["inv_item_idm"]),
      itemCode: stringOrNull(data["code"]),
      medicationName,
      quantity: Number(data["QTY"] ?? 0),
      serviceCode: stringOrNull(data["SERVICECODE"]),
      upcCode: stringOrNull(data["upc_code"]),
      unitServicePrice: data["UNITSERVICEPRICE"] ? Number(data["UNITSERVICEPRICE"]) : null,
      patientShareTotal: data["TOT SERVICE PAT SHARE"] ? Number(data["TOT SERVICE PAT SHARE"]) : null,
      payerTaxShare: data["PAYERTAXSHARE"] ? Number(data["PAYERTAXSHARE"]) : null,
    });
  }

  const groups = new Map<string, ParsedInsuranceRow[]>();
  for (const parsed of parsedRows) {
    const groupKey = buildInsuranceGroupKey({
      nationalId: parsed.nationalId,
      claimSequenceId: parsed.claimSequenceId,
      phoneNormalized: parsed.phoneNormalized,
      invoiceNo: parsed.invoiceNo,
      serviceDateIso: parsed.serviceDateIso,
    });
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
      let person = first.nationalId
        ? await tx.person.findFirst({ where: { nationalId: first.nationalId } })
        : await tx.person.findFirst({ where: { phoneNormalized: first.phoneNormalized } });

      if (!person) {
        person = await tx.person.create({
          data: {
            phoneRaw: first.phoneRaw,
            phoneNormalized: first.phoneNormalized,
            nationalId: first.nationalId,
            fullName: first.fullName,
            gender: first.gender,
          },
        });
      }

      let lead = await tx.lead.findFirst({ where: { groupKey, type: LeadType.INSURANCE } });
      if (!lead) {
        lead = await tx.lead.create({
          data: {
            type: LeadType.INSURANCE,
            status: LeadStatus.AVAILABLE,
            personId: person.id,
            batchId,
            branchCode: first.branchCode,
            partner: "Med Gulf",
            groupKey,
            sourceOrder: Math.min(...groupRows.map((r) => r.row.sourceRowNumber)),
            appReferenceNo: first.appReferenceNo,
            claimSequenceId: first.claimSequenceId,
            claimDate: first.claimDateIso ? new Date(`${first.claimDateIso}T00:00:00.000Z`) : null,
            serviceDate: first.serviceDateIso ? new Date(`${first.serviceDateIso}T00:00:00.000Z`) : null,
            invoiceNo: first.invoiceNo,
            payerId: first.payerId,
            policyNo: first.policyNo,
            preauthReferenceNo: first.preauthReferenceNo,
            memberClass: first.memberClass,
            transactionNo: first.transactionNo,
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
        const sourceItemKey = buildInsuranceItemKey({
          invoiceItemKey: parsed.invoiceItemKey,
          claimSequenceId: parsed.claimSequenceId,
          itemCode: parsed.itemCode,
        });
        await tx.leadMedicationItem.upsert({
          where: { leadId_sourceItemKey: { leadId: lead.id, sourceItemKey } },
          update: {},
          create: {
            leadId: lead.id,
            sourceItemKey,
            medicationName: parsed.medicationName,
            quantity: parsed.quantity,
            itemCode: parsed.itemCode,
            serviceCode: parsed.serviceCode,
            upcCode: parsed.upcCode,
            unitServicePrice: parsed.unitServicePrice,
            patientShareTotal: parsed.patientShareTotal,
            payerTaxShare: parsed.payerTaxShare,
          },
        });
        itemsUpserted++;

        await tx.leadImportRow.update({ where: { id: parsed.row.id }, data: { leadId: lead.id, groupKey } });
      }
    });
  }

  return { groupsSeen: groups.size, leadsCreated, leadsAlreadyExisted, itemsUpserted };
}
