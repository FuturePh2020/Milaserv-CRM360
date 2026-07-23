-- CdrStagingRecord was incorrectly unique per (cdr_import_id, cdr_record_id).
-- Real Yeastar CDR exports record one row per call LEG, and multiple legs
-- (IVR -> transfer -> agent) can share the same cdr_record_id (confirmed
-- against the real sample file: ~24% of sessions have 2-7 legs). The old
-- constraint silently discarded every leg after the first via
-- skipDuplicates. Staging data is disposable/reprocessable, so this
-- migration clears it rather than trying to backfill sourceRowNumber for
-- rows whose true per-row identity was never captured.
TRUNCATE TABLE "cdr_staging_records";

DROP INDEX IF EXISTS "cdr_staging_records_cdr_import_id_cdr_record_id_key";

ALTER TABLE "cdr_staging_records" ADD COLUMN "source_row_number" INTEGER NOT NULL;

CREATE UNIQUE INDEX "cdr_staging_records_cdr_import_id_source_row_number_key" ON "cdr_staging_records"("cdr_import_id", "source_row_number");

CREATE INDEX "cdr_staging_records_cdr_import_id_cdr_record_id_idx" ON "cdr_staging_records"("cdr_import_id", "cdr_record_id");
