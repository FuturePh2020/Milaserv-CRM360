import { PrismaClient, ImportStatus } from "@milaserv/database";

const prisma = new PrismaClient();

/**
 * Generic batch-processing step: marks the batch complete based on the
 * validity counts already computed at preview time. This does not yet
 * create Lead/LeadMedicationItem rows - grouping and normalization are
 * source-type-specific (Cash vs Insurance vs CDR) and are implemented in
 * Phase 3/9. This Phase 2 step establishes the queue -> status transition
 * -> idempotency plumbing those phases plug into.
 */
export async function processBatch(batchId: string): Promise<void> {
  const batch = await prisma.leadImportBatch.findUniqueOrThrow({ where: { id: batchId } });

  if (batch.status !== ImportStatus.QUEUED) {
    // Re-delivered job (e.g. after a worker restart) for a batch that already
    // finished - do nothing rather than reprocess and double-count.
    return;
  }

  await prisma.leadImportBatch.update({
    where: { id: batchId },
    data: { status: ImportStatus.PROCESSING },
  });

  const finalStatus =
    batch.invalidRows > 0 ? ImportStatus.COMPLETED_WITH_ERRORS : ImportStatus.COMPLETED;

  await prisma.leadImportBatch.update({
    where: { id: batchId },
    data: { status: finalStatus, processedAt: new Date() },
  });
}
