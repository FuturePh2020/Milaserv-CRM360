"use client";

import { LeadsSummaryCard } from "../../../../components/LeadsSummaryCard";
import { ImportUploadFlow } from "../../../../components/ImportUploadFlow";

export default function AdminCashLeadsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Cash Leads</h1>
      <div className="mb-6">
        <ImportUploadFlow sourceType="CASH" leadType="CASH" />
      </div>
      <LeadsSummaryCard leadType="CASH" />
    </div>
  );
}
