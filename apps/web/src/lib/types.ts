export type LeadType = "CASH" | "INSURANCE";

export type LeadStatus =
  | "IMPORTED"
  | "AVAILABLE"
  | "PENDING_CALL"
  | "CUSTOMER_CONTACTED"
  | "DISPOSITION_REQUIRED"
  | "CALLBACK_ELIGIBLE"
  | "FOLLOW_UP_SCHEDULED"
  | "CONVERTED_TO_ORDER"
  | "COMPLETED"
  | "INVALID_NUMBER"
  | "ARCHIVED";

export type DispositionType =
  | "ALREADY_DISPENSED"
  | "ACUTE_MEDICATION_CASE"
  | "WRONG_NUMBER"
  | "NO_ANSWER_BUSY"
  | "ORDER_CREATED"
  | "ANSWERED_NO_ORDER"
  | "NOT_ACTIVE_MEMBER"
  | "RESCHEDULE_FOLLOW_UP"
  | "UNCOVERED_CUSTOMER"
  | "LABORATORY_CASE";

export const DISPOSITION_LABELS: Record<DispositionType, string> = {
  ALREADY_DISPENSED: "Already Dispensed / Approved & Dispensed",
  ACUTE_MEDICATION_CASE: "Acute Medication Case",
  WRONG_NUMBER: "Wrong Number",
  NO_ANSWER_BUSY: "No Answer / Busy",
  ORDER_CREATED: "Order Created",
  ANSWERED_NO_ORDER: "Answered - No Order",
  NOT_ACTIVE_MEMBER: "Not Active Member",
  RESCHEDULE_FOLLOW_UP: "Reschedule / Follow-up Request",
  UNCOVERED_CUSTOMER: "Uncovered Customer",
  LABORATORY_CASE: "Laboratory Case",
};

export interface MedicationItem {
  id: string;
  medicationName: string;
  quantity: string;
  itemCode: string | null;
  priceAmount: string | null;
}

export interface LeadDetail {
  id: string;
  type: LeadType;
  status: LeadStatus;
  branchCode: string | null;
  city: string | null;
  partner: string | null;
  person: {
    fullName: string | null;
    phoneRaw: string;
    phoneNormalized: string;
    nationalId: string | null;
  };
  medicationItems: MedicationItem[];
}
