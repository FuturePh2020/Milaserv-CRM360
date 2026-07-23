-- AlterTable
ALTER TABLE "lead_dispositions" ADD COLUMN     "last_dispense_date" DATE,
ADD COLUMN     "next_refill_date" DATE,
ADD COLUMN     "refill_period_days" INTEGER;

-- CreateIndex
CREATE INDEX "lead_dispositions_next_refill_date_idx" ON "lead_dispositions"("next_refill_date");

-- Defense-in-depth: enforce the 26-80 day refill window at the DB layer too
-- (spec: "refill period check: 26 to 80"), not just in application code.
ALTER TABLE "lead_dispositions" ADD CONSTRAINT "lead_dispositions_refill_period_check"
  CHECK ("refill_period_days" IS NULL OR ("refill_period_days" >= 26 AND "refill_period_days" <= 80));
