-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('TEAM_LEADER', 'SHIFT_SUPERVISOR', 'AGENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('CASH', 'INSURANCE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ON_MANUAL_BREAK', 'ON_IDLE_BREAK', 'ENDED', 'FORCE_CLOSED');

-- CreateEnum
CREATE TYPE "BreakType" AS ENUM ('MANUAL', 'IDLE');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'WORKED_NO_BREAK', 'VACATION', 'ABSENT', 'DAY_OFF', 'PARTIAL_SESSION', 'SESSION_NOT_CLOSED', 'FORCE_CLOSED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('IMPORTED', 'AVAILABLE', 'PENDING_CALL', 'CUSTOMER_CONTACTED', 'DISPOSITION_REQUIRED', 'CALLBACK_ELIGIBLE', 'FOLLOW_UP_SCHEDULED', 'CONVERTED_TO_ORDER', 'COMPLETED', 'INVALID_NUMBER', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('GENERATE_LEAD', 'TAKE_LEAD', 'ADMIN_ASSIGNMENT', 'ADMIN_REASSIGNMENT');

-- CreateEnum
CREATE TYPE "DispositionType" AS ENUM ('ALREADY_DISPENSED', 'ACUTE_MEDICATION_CASE', 'WRONG_NUMBER', 'NO_ANSWER_BUSY', 'ORDER_CREATED', 'ANSWERED_NO_ORDER', 'NOT_ACTIVE_MEMBER', 'RESCHEDULE_FOLLOW_UP', 'UNCOVERED_CUSTOMER', 'LABORATORY_CASE');

-- CreateEnum
CREATE TYPE "FollowUpPeriod" AS ENUM ('MORNING', 'EVENING');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('CASH', 'INSURANCE', 'CDR');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'PREVIEW_READY', 'QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "LegacyAgentPreservationMode" AS ENUM ('DO_NOT_PRESERVE', 'PRESERVE_WHEN_MAPPED');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CallProviderStatus" AS ENUM ('ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED_OR_UNKNOWN');

-- CreateEnum
CREATE TYPE "CallMatchStatus" AS ENUM ('MATCHED', 'NOT_MATCHED', 'AMBIGUOUS', 'AGENT_MISMATCH', 'OUTSIDE_ASSIGNMENT_WINDOW', 'INVALID_PHONE', 'UNMAPPED_EXTENSION');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'DEVICE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "team_id" TEXT,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_info" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "supervisor_id" TEXT,
    "start_time_local" TEXT NOT NULL,
    "end_time_local" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_schedules" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "is_day_off" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_lead_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "lead_type" "LeadType" NOT NULL,
    "partner" TEXT NOT NULL DEFAULT 'ALL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_lead_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_mappings" (
    "id" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "user_id" TEXT,
    "display_name" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extension_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_registrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "companion_version" TEXT,
    "last_heartbeat_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "device_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT,
    "shift_id" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_work_seconds" INTEGER NOT NULL DEFAULT 0,
    "total_break_seconds" INTEGER NOT NULL DEFAULT 0,
    "device_id" TEXT,
    "force_closed_by" TEXT,
    "force_close_reason" TEXT,
    "active_owner_marker" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "BreakType" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "break_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_heartbeats" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "session_id" TEXT,
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "idle_duration_seconds" INTEGER NOT NULL,
    "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companion_version" TEXT,

    CONSTRAINT "activity_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "total_work_seconds" INTEGER NOT NULL DEFAULT 0,
    "total_break_seconds" INTEGER NOT NULL DEFAULT 0,
    "manual_break_seconds" INTEGER NOT NULL DEFAULT 0,
    "idle_break_seconds" INTEGER NOT NULL DEFAULT 0,
    "break_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_import_batches" (
    "id" TEXT NOT NULL,
    "source_type" "ImportSourceType" NOT NULL,
    "lead_type" "LeadType",
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "file_id" TEXT NOT NULL,
    "date_format" TEXT,
    "column_mapping_id" TEXT,
    "legacy_agent_mode" "LegacyAgentPreservationMode" NOT NULL DEFAULT 'DO_NOT_PRESERVE',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "already_imported_rows" INTEGER NOT NULL DEFAULT 0,
    "grouped_lead_count" INTEGER NOT NULL DEFAULT 0,
    "medication_item_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_import_files" (
    "id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_import_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_column_mappings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_type" "ImportSourceType" NOT NULL,
    "mapping" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_column_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_import_rows" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source_row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB,
    "group_key" TEXT,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "lead_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_import_errors" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_id" TEXT,
    "source_row_number" INTEGER NOT NULL,
    "error_code" TEXT NOT NULL,
    "error_message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_import_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "full_name" TEXT,
    "phone_raw" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "national_id" TEXT,
    "gender" TEXT,
    "household_group_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_groups" (
    "id" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "type" "LeadType" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'IMPORTED',
    "person_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "branch_code" TEXT,
    "city" TEXT,
    "partner" TEXT,
    "group_key" TEXT NOT NULL,
    "source_lead_date" TIMESTAMP(3),
    "legacy_agent_label" TEXT,
    "source_status_raw" TEXT,
    "active_owner_marker" BOOLEAN DEFAULT true,
    "batch_priority" INTEGER NOT NULL DEFAULT 100,
    "source_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "app_reference_no" TEXT,
    "claim_sequence_id" TEXT,
    "claim_date" TIMESTAMP(3),
    "service_date" TIMESTAMP(3),
    "invoice_no" TEXT,
    "payer_id" TEXT,
    "policy_no" TEXT,
    "preauth_reference_no" TEXT,
    "member_class" TEXT,
    "transaction_no" TEXT,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_medication_items" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "source_item_key" TEXT NOT NULL,
    "medication_name" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "item_code" TEXT,
    "service_code" TEXT,
    "upc_code" TEXT,
    "unit_service_price" DECIMAL(14,5),
    "patient_share_total" DECIMAL(14,5),
    "payer_tax_share" DECIMAL(14,5),
    "price_raw" TEXT,
    "price_amount" DECIMAL(14,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_medication_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_assignments" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "source" "AssignmentSource" NOT NULL,
    "team_id" TEXT,
    "shift_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "release_actor_id" TEXT,
    "release_reason" TEXT,
    "previous_assignment_id" TEXT,
    "active_lead_marker" TEXT,
    "active_agent_marker" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_dispositions" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "disposition" "DispositionType" NOT NULL,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'AGENT',
    "previous_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "edited_by_id" TEXT,
    "edited_at" TIMESTAMP(3),

    CONSTRAINT "lead_dispositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_follow_ups" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "follow_up_date" DATE NOT NULL,
    "period" "FollowUpPeriod" NOT NULL,
    "exact_time" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_order_references" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "external_order_number" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_order_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_status_history" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_status" "LeadStatus",
    "to_status" "LeadStatus" NOT NULL,
    "actor_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cdr_imports" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source_timezone" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "matched_rows" INTEGER NOT NULL DEFAULT 0,
    "unmatched_rows" INTEGER NOT NULL DEFAULT 0,
    "ambiguous_rows" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cdr_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cdr_staging_records" (
    "id" TEXT NOT NULL,
    "cdr_import_id" TEXT NOT NULL,
    "cdr_record_id" TEXT NOT NULL,
    "raw_row" JSONB NOT NULL,
    "call_started_at_source" TEXT NOT NULL,
    "call_from_raw" TEXT NOT NULL,
    "call_to_raw" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "is_relevant" BOOLEAN NOT NULL DEFAULT false,
    "customer_phone_normalized" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cdr_staging_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cdr_records" (
    "id" TEXT NOT NULL,
    "cdr_import_id" TEXT NOT NULL,
    "cdr_record_id" TEXT NOT NULL,
    "call_started_at" TIMESTAMP(3) NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "customer_phone_raw" TEXT NOT NULL,
    "customer_phone_normalized" TEXT NOT NULL,
    "agent_extension" TEXT,
    "agent_user_id" TEXT,
    "call_duration_seconds" INTEGER NOT NULL,
    "ring_duration_seconds" INTEGER NOT NULL,
    "talk_duration_seconds" INTEGER NOT NULL,
    "provider_status_raw" TEXT NOT NULL,
    "provider_status" "CallProviderStatus" NOT NULL,
    "provider_reason_raw" TEXT,
    "outbound_caller_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cdr_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_attempts" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_matches" (
    "id" TEXT NOT NULL,
    "call_attempt_id" TEXT,
    "cdr_record_id" TEXT NOT NULL,
    "status" "CallMatchStatus" NOT NULL,
    "mismatch_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_type" "AuditActorType" NOT NULL DEFAULT 'USER',
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateIndex
CREATE INDEX "shifts_team_id_idx" ON "shifts"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "shift_schedules_shift_id_user_id_day_of_week_key" ON "shift_schedules"("shift_id", "user_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "user_lead_permissions_user_id_lead_type_partner_key" ON "user_lead_permissions"("user_id", "lead_type", "partner");

-- CreateIndex
CREATE UNIQUE INDEX "extension_mappings_extension_key" ON "extension_mappings"("extension");

-- CreateIndex
CREATE UNIQUE INDEX "device_registrations_device_id_key" ON "device_registrations"("device_id");

-- CreateIndex
CREATE INDEX "device_registrations_user_id_idx" ON "device_registrations"("user_id");

-- CreateIndex
CREATE INDEX "work_sessions_user_id_started_at_idx" ON "work_sessions"("user_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "work_sessions_user_id_active_owner_marker_key" ON "work_sessions"("user_id", "active_owner_marker");

-- CreateIndex
CREATE INDEX "break_events_user_id_started_at_idx" ON "break_events"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "break_events_session_id_idx" ON "break_events"("session_id");

-- CreateIndex
CREATE INDEX "activity_heartbeats_device_id_heartbeat_at_idx" ON "activity_heartbeats"("device_id", "heartbeat_at");

-- CreateIndex
CREATE INDEX "activity_heartbeats_session_id_idx" ON "activity_heartbeats"("session_id");

-- CreateIndex
CREATE INDEX "attendance_days_date_status_idx" ON "attendance_days"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_user_id_date_key" ON "attendance_days"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "lead_import_batches_file_id_key" ON "lead_import_batches"("file_id");

-- CreateIndex
CREATE INDEX "lead_import_batches_source_type_status_idx" ON "lead_import_batches"("source_type", "status");

-- CreateIndex
CREATE INDEX "lead_import_files_checksum_sha256_idx" ON "lead_import_files"("checksum_sha256");

-- CreateIndex
CREATE INDEX "lead_import_rows_batch_id_group_key_idx" ON "lead_import_rows"("batch_id", "group_key");

-- CreateIndex
CREATE INDEX "lead_import_rows_batch_id_is_valid_idx" ON "lead_import_rows"("batch_id", "is_valid");

-- CreateIndex
CREATE INDEX "lead_import_errors_batch_id_idx" ON "lead_import_errors"("batch_id");

-- CreateIndex
CREATE INDEX "people_phone_normalized_idx" ON "people"("phone_normalized");

-- CreateIndex
CREATE INDEX "people_national_id_idx" ON "people"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "household_groups_phone_normalized_key" ON "household_groups"("phone_normalized");

-- CreateIndex
CREATE INDEX "leads_type_status_idx" ON "leads"("type", "status");

-- CreateIndex
CREATE INDEX "leads_batch_id_idx" ON "leads"("batch_id");

-- CreateIndex
CREATE INDEX "leads_group_key_idx" ON "leads"("group_key");

-- CreateIndex
CREATE INDEX "lead_medication_items_lead_id_idx" ON "lead_medication_items"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_medication_items_lead_id_source_item_key_key" ON "lead_medication_items"("lead_id", "source_item_key");

-- CreateIndex
CREATE INDEX "lead_assignments_lead_id_assigned_at_idx" ON "lead_assignments"("lead_id", "assigned_at");

-- CreateIndex
CREATE INDEX "lead_assignments_agent_id_assigned_at_idx" ON "lead_assignments"("agent_id", "assigned_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_assignments_active_lead_marker_key" ON "lead_assignments"("active_lead_marker");

-- CreateIndex
CREATE UNIQUE INDEX "lead_assignments_active_agent_marker_key" ON "lead_assignments"("active_agent_marker");

-- CreateIndex
CREATE INDEX "lead_dispositions_lead_id_idx" ON "lead_dispositions"("lead_id");

-- CreateIndex
CREATE INDEX "lead_dispositions_agent_id_created_at_idx" ON "lead_dispositions"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_dispositions_disposition_idx" ON "lead_dispositions"("disposition");

-- CreateIndex
CREATE INDEX "lead_follow_ups_lead_id_idx" ON "lead_follow_ups"("lead_id");

-- CreateIndex
CREATE INDEX "lead_follow_ups_follow_up_date_idx" ON "lead_follow_ups"("follow_up_date");

-- CreateIndex
CREATE UNIQUE INDEX "lead_order_references_lead_id_key" ON "lead_order_references"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_order_references_external_order_number_key" ON "lead_order_references"("external_order_number");

-- CreateIndex
CREATE INDEX "lead_status_history_lead_id_created_at_idx" ON "lead_status_history"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_notes_lead_id_idx" ON "lead_notes"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "cdr_imports_batch_id_key" ON "cdr_imports"("batch_id");

-- CreateIndex
CREATE INDEX "cdr_staging_records_customer_phone_normalized_idx" ON "cdr_staging_records"("customer_phone_normalized");

-- CreateIndex
CREATE INDEX "cdr_staging_records_cdr_import_id_is_relevant_idx" ON "cdr_staging_records"("cdr_import_id", "is_relevant");

-- CreateIndex
CREATE UNIQUE INDEX "cdr_staging_records_cdr_import_id_cdr_record_id_key" ON "cdr_staging_records"("cdr_import_id", "cdr_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "cdr_records_cdr_record_id_key" ON "cdr_records"("cdr_record_id");

-- CreateIndex
CREATE INDEX "cdr_records_customer_phone_normalized_call_started_at_idx" ON "cdr_records"("customer_phone_normalized", "call_started_at");

-- CreateIndex
CREATE INDEX "cdr_records_agent_extension_call_started_at_idx" ON "cdr_records"("agent_extension", "call_started_at");

-- CreateIndex
CREATE INDEX "call_attempts_lead_id_idx" ON "call_attempts"("lead_id");

-- CreateIndex
CREATE INDEX "call_attempts_assignment_id_idx" ON "call_attempts"("assignment_id");

-- CreateIndex
CREATE INDEX "call_matches_call_attempt_id_idx" ON "call_matches"("call_attempt_id");

-- CreateIndex
CREATE INDEX "call_matches_cdr_record_id_idx" ON "call_matches"("cdr_record_id");

-- CreateIndex
CREATE INDEX "call_matches_status_idx" ON "call_matches"("status");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_schedules" ADD CONSTRAINT "shift_schedules_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lead_permissions" ADD CONSTRAINT "user_lead_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_mappings" ADD CONSTRAINT "extension_mappings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_events" ADD CONSTRAINT "break_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "work_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_heartbeats" ADD CONSTRAINT "activity_heartbeats_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device_registrations"("device_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_heartbeats" ADD CONSTRAINT "activity_heartbeats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "work_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_import_batches" ADD CONSTRAINT "lead_import_batches_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "lead_import_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_import_batches" ADD CONSTRAINT "lead_import_batches_column_mapping_id_fkey" FOREIGN KEY ("column_mapping_id") REFERENCES "import_column_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_import_rows" ADD CONSTRAINT "lead_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "lead_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_import_rows" ADD CONSTRAINT "lead_import_rows_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_import_errors" ADD CONSTRAINT "lead_import_errors_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "lead_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_import_errors" ADD CONSTRAINT "lead_import_errors_row_id_fkey" FOREIGN KEY ("row_id") REFERENCES "lead_import_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_household_group_id_fkey" FOREIGN KEY ("household_group_id") REFERENCES "household_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "lead_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_medication_items" ADD CONSTRAINT "lead_medication_items_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_dispositions" ADD CONSTRAINT "lead_dispositions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_dispositions" ADD CONSTRAINT "lead_dispositions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_order_references" ADD CONSTRAINT "lead_order_references_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cdr_imports" ADD CONSTRAINT "cdr_imports_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "lead_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cdr_staging_records" ADD CONSTRAINT "cdr_staging_records_cdr_import_id_fkey" FOREIGN KEY ("cdr_import_id") REFERENCES "cdr_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cdr_records" ADD CONSTRAINT "cdr_records_cdr_import_id_fkey" FOREIGN KEY ("cdr_import_id") REFERENCES "cdr_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "lead_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_matches" ADD CONSTRAINT "call_matches_call_attempt_id_fkey" FOREIGN KEY ("call_attempt_id") REFERENCES "call_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_matches" ADD CONSTRAINT "call_matches_cdr_record_id_fkey" FOREIGN KEY ("cdr_record_id") REFERENCES "cdr_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
