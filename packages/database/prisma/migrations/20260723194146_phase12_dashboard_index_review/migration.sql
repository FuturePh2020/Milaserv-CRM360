-- Phase 12 index review: the Phase 10 dashboard/report queries (polled
-- every 15s from an admin's Overview page) filter/join on these columns
-- with no supporting index, meaning every call was a sequential scan.
-- Purely additive - safe to apply without downtime.

-- CreateIndex
CREATE INDEX "lead_assignments_team_id_assigned_at_idx" ON "lead_assignments"("team_id", "assigned_at");

-- CreateIndex
CREATE INDEX "lead_order_references_created_by_id_idx" ON "lead_order_references"("created_by_id");

-- CreateIndex
CREATE INDEX "users_role_team_id_idx" ON "users"("role", "team_id");

-- CreateIndex
CREATE INDEX "work_sessions_team_id_status_idx" ON "work_sessions"("team_id", "status");
