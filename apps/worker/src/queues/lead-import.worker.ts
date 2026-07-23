import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES } from "./queue-names";
import { processBatch } from "../imports/process-batch";

export interface LeadImportJobData {
  batchId: string;
}

/**
 * Generic batch-completion step (Phase 2). Real Cash/Insurance/CDR grouping
 * and Lead creation are source-type-specific and land in Phase 3/9 - see
 * apps/worker/src/imports/process-batch.ts for what this currently does and
 * does not do.
 */
export function createLeadImportWorker(connection: IORedis) {
  return new Worker<LeadImportJobData>(
    QUEUE_NAMES.LEAD_IMPORT,
    async (job: Job<LeadImportJobData>) => {
      // eslint-disable-next-line no-console
      console.log(`[lead-import] processing batch ${job.data.batchId}`);
      await processBatch(job.data.batchId);
    },
    {
      connection,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
    },
  );
}
