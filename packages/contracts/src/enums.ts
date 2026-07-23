// Mirrors packages/database Prisma enums. Kept dependency-free so the
// Next.js web app does not need to import the Prisma client.

export const UserRole = {
  TEAM_LEADER: "TEAM_LEADER",
  SHIFT_SUPERVISOR: "SHIFT_SUPERVISOR",
  AGENT: "AGENT",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const LeadType = {
  CASH: "CASH",
  INSURANCE: "INSURANCE",
} as const;
export type LeadType = (typeof LeadType)[keyof typeof LeadType];

export const SessionStatus = {
  ACTIVE: "ACTIVE",
  ON_MANUAL_BREAK: "ON_MANUAL_BREAK",
  ON_IDLE_BREAK: "ON_IDLE_BREAK",
  ENDED: "ENDED",
  FORCE_CLOSED: "FORCE_CLOSED",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const LeadStatus = {
  IMPORTED: "IMPORTED",
  AVAILABLE: "AVAILABLE",
  PENDING_CALL: "PENDING_CALL",
  CUSTOMER_CONTACTED: "CUSTOMER_CONTACTED",
  DISPOSITION_REQUIRED: "DISPOSITION_REQUIRED",
  CALLBACK_ELIGIBLE: "CALLBACK_ELIGIBLE",
  FOLLOW_UP_SCHEDULED: "FOLLOW_UP_SCHEDULED",
  CONVERTED_TO_ORDER: "CONVERTED_TO_ORDER",
  COMPLETED: "COMPLETED",
  INVALID_NUMBER: "INVALID_NUMBER",
  ARCHIVED: "ARCHIVED",
} as const;
export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const DispositionType = {
  ALREADY_DISPENSED: "ALREADY_DISPENSED",
  ACUTE_MEDICATION_CASE: "ACUTE_MEDICATION_CASE",
  WRONG_NUMBER: "WRONG_NUMBER",
  NO_ANSWER_BUSY: "NO_ANSWER_BUSY",
  ORDER_CREATED: "ORDER_CREATED",
  ANSWERED_NO_ORDER: "ANSWERED_NO_ORDER",
  NOT_ACTIVE_MEMBER: "NOT_ACTIVE_MEMBER",
  RESCHEDULE_FOLLOW_UP: "RESCHEDULE_FOLLOW_UP",
  UNCOVERED_CUSTOMER: "UNCOVERED_CUSTOMER",
  LABORATORY_CASE: "LABORATORY_CASE",
} as const;
export type DispositionType = (typeof DispositionType)[keyof typeof DispositionType];

export const DISPOSITION_LABELS: Record<DispositionType, string> = {
  ALREADY_DISPENSED: "Already Dispensed / Approved&Dispensed",
  ACUTE_MEDICATION_CASE: "Acute Medication Cases",
  WRONG_NUMBER: "Wrong Numbers",
  NO_ANSWER_BUSY: "No Answer / Busy",
  ORDER_CREATED: "Order Created",
  ANSWERED_NO_ORDER: "Answered No Order",
  NOT_ACTIVE_MEMBER: "Not Active Members",
  RESCHEDULE_FOLLOW_UP: "Reschedule / Follow-up Requests",
  UNCOVERED_CUSTOMER: "Uncovered Customers",
  LABORATORY_CASE: "Laboratory Cases",
};

export const AttendanceStatus = {
  PRESENT: "PRESENT",
  WORKED_NO_BREAK: "WORKED_NO_BREAK",
  VACATION: "VACATION",
  ABSENT: "ABSENT",
  DAY_OFF: "DAY_OFF",
  PARTIAL_SESSION: "PARTIAL_SESSION",
  SESSION_NOT_CLOSED: "SESSION_NOT_CLOSED",
  FORCE_CLOSED: "FORCE_CLOSED",
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const CallMatchStatus = {
  MATCHED: "MATCHED",
  NOT_MATCHED: "NOT_MATCHED",
  AMBIGUOUS: "AMBIGUOUS",
  AGENT_MISMATCH: "AGENT_MISMATCH",
  OUTSIDE_ASSIGNMENT_WINDOW: "OUTSIDE_ASSIGNMENT_WINDOW",
  INVALID_PHONE: "INVALID_PHONE",
  UNMAPPED_EXTENSION: "UNMAPPED_EXTENSION",
} as const;
export type CallMatchStatus = (typeof CallMatchStatus)[keyof typeof CallMatchStatus];
