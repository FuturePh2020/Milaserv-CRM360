-- Removes the Windows-companion device-registration model in favor of
-- browser-based activity tracking (CLAUDE.md rule 3): the browser tracker
-- authenticates via the Agent's own JWT session, not a separate device
-- token, so ActivityHeartbeat is re-keyed directly to the user instead of
-- to a DeviceRegistration.

-- Backfill user_id on existing heartbeat rows from the device registration
-- they came from, before adding the NOT NULL constraint. Safe even if
-- device_registrations is later dropped, since this runs first.
ALTER TABLE "activity_heartbeats" ADD COLUMN "user_id" TEXT;

UPDATE "activity_heartbeats" ah
SET "user_id" = dr."user_id"
FROM "device_registrations" dr
WHERE ah."device_id" = dr."device_id";

-- Any heartbeat row that somehow has no matching device registration
-- (shouldn't happen given the FK that existed until now) has no correct
-- user to attribute it to - it's operational telemetry, not an audit
-- record, so deleting the orphan is safe and preferable to guessing.
DELETE FROM "activity_heartbeats" WHERE "user_id" IS NULL;

ALTER TABLE "activity_heartbeats" ALTER COLUMN "user_id" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "activity_heartbeats" DROP CONSTRAINT "activity_heartbeats_device_id_fkey";

-- DropForeignKey
ALTER TABLE "device_registrations" DROP CONSTRAINT "device_registrations_user_id_fkey";

-- DropIndex
DROP INDEX "activity_heartbeats_device_id_heartbeat_at_idx";

-- AlterTable
ALTER TABLE "activity_heartbeats" DROP COLUMN "companion_version",
DROP COLUMN "device_id";

-- AlterTable
ALTER TABLE "users" ADD COLUMN "activity_tracking_enabled" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "device_registrations";

-- CreateIndex
CREATE INDEX "activity_heartbeats_user_id_heartbeat_at_idx" ON "activity_heartbeats"("user_id", "heartbeat_at");

-- AddForeignKey
ALTER TABLE "activity_heartbeats" ADD CONSTRAINT "activity_heartbeats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
