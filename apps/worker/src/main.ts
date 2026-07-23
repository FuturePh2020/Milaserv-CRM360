import { createRedisConnection } from "./redis";
import { createLeadImportWorker } from "./queues/lead-import.worker";

async function bootstrap() {
  const connection = createRedisConnection();
  const leadImportWorker = createLeadImportWorker(connection);

  leadImportWorker.on("failed", (job, error) => {
    // eslint-disable-next-line no-console
    console.error(`[lead-import] job ${job?.id} failed`, error);
  });

  // eslint-disable-next-line no-console
  console.log("Milaserv CRM360 worker started");

  process.on("SIGTERM", async () => {
    await leadImportWorker.close();
    await connection.quit();
    process.exit(0);
  });
}

bootstrap();
