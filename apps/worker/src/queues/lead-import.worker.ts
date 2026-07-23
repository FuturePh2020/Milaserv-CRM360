import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES } from "./queue-names";

export interface LeadImportJobData {
  batchId: string;
}

/**
 * Placeholder processor. The real Cash/Insurance parsing pipeline is implemented
 * in Phase 2/3 (see docs/implementation/IMPLEMENTATION_PLAN.md); this establishes
 * the queue wiring, concurrency, and retry behavior the pipeline will plug into.
 */
export function createLeadImportWorker(connection: IORedis) {
  return new Worker<LeadImportJobData>(
    QUEUE_NAMES.LEAD_IMPORT,
    async (job: Job<LeadImportJobData>) => {
      // eslint-disable-next-line no-console
      console.log(`[lead-import] processing batch ${job.data.batchId}`);
    },
    {
      connection,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
    },
  );
}
