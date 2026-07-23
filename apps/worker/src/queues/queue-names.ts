/**
 * Queue names shared between the API (producer) and worker (consumer).
 * Kept in one place so a typo cannot silently create a second, disconnected queue.
 */
export const QUEUE_NAMES = {
  LEAD_IMPORT: "lead-import",
  CDR_IMPORT: "cdr-import",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
