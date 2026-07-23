import { PrismaClient, ImportStatus, ImportSourceType } from "@milaserv/database";
import type { ImportDateFormat } from "@milaserv/validation";
import { processCashRows } from "./cash.processor";
import { processInsuranceRows } from "./insurance.processor";
import { processCdrRows } from "./cdr.processor";

const prisma = new PrismaClient();

const VALID_DATE_FORMATS: ImportDateFormat[] = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

/**
 * Batch-processing step: Cash/Insurance batches are grouped into
 * Lead/LeadMedicationItem rows (spec §8/§9); CDR batches are staged and
 * matched against lead assignments (spec §16). Transitions
 * QUEUED -> PROCESSING -> COMPLETED/COMPLETED_WITH_ERRORS/FAILED and is a
 * no-op if redelivered for a batch that already finished.
 */
export async function processBatch(batchId: string): Promise<void> {
  const batch = await prisma.leadImportBatch.findUniqueOrThrow({ where: { id: batchId } });

  if (batch.status !== ImportStatus.QUEUED) {
    return;
  }

  await prisma.leadImportBatch.update({
    where: { id: batchId },
    data: { status: ImportStatus.PROCESSING },
  });

  if (batch.sourceType === ImportSourceType.CASH || batch.sourceType === ImportSourceType.INSURANCE) {
    const dateFormat = batch.dateFormat as ImportDateFormat | null;
    if (!dateFormat || !VALID_DATE_FORMATS.includes(dateFormat)) {
      await prisma.leadImportError.create({
        data: {
          batchId,
          sourceRowNumber: 0,
          errorCode: "MISSING_DATE_FORMAT",
          errorMessage: "Batch has no valid date format selected; cannot parse date columns.",
        },
      });
      await prisma.leadImportBatch.update({
        where: { id: batchId },
        data: { status: ImportStatus.FAILED, processedAt: new Date() },
      });
      return;
    }

    const result =
      batch.sourceType === ImportSourceType.CASH
        ? await processCashRows(prisma, batchId, dateFormat)
        : await processInsuranceRows(prisma, batchId, dateFormat);

    const totalErrors = await prisma.leadImportError.count({ where: { batchId } });
    const finalStatus = totalErrors > 0 ? ImportStatus.COMPLETED_WITH_ERRORS : ImportStatus.COMPLETED;

    await prisma.leadImportBatch.update({
      where: { id: batchId },
      data: {
        groupedLeadCount: result.leadsCreated + result.leadsAlreadyExisted,
        medicationItemCount: result.itemsUpserted,
        status: finalStatus,
        processedAt: new Date(),
      },
    });

    return;
  }

  if (batch.sourceType === ImportSourceType.CDR) {
    await processCdrRows(prisma, batchId);

    const totalErrors = await prisma.leadImportError.count({ where: { batchId } });
    const finalStatus = totalErrors > 0 ? ImportStatus.COMPLETED_WITH_ERRORS : ImportStatus.COMPLETED;

    await prisma.leadImportBatch.update({
      where: { id: batchId },
      data: { status: finalStatus, processedAt: new Date() },
    });
  }
}
