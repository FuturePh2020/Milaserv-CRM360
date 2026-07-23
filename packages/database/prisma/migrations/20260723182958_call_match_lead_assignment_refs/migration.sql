-- AlterTable
ALTER TABLE "call_matches" ADD COLUMN     "assignment_id" TEXT,
ADD COLUMN     "lead_id" TEXT;

-- CreateIndex
CREATE INDEX "call_matches_lead_id_idx" ON "call_matches"("lead_id");

-- CreateIndex
CREATE INDEX "call_matches_assignment_id_idx" ON "call_matches"("assignment_id");

-- AddForeignKey
ALTER TABLE "call_matches" ADD CONSTRAINT "call_matches_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_matches" ADD CONSTRAINT "call_matches_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "lead_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
