"use client";

import { LeadsSummaryCard } from "../../../../components/LeadsSummaryCard";
import { ImportUploadFlow } from "../../../../components/ImportUploadFlow";

export default function AdminInsuranceLeadsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Insurance Leads</h1>
      <div className="mb-6">
        <ImportUploadFlow sourceType="INSURANCE" leadType="INSURANCE" />
      </div>
      <LeadsSummaryCard leadType="INSURANCE" />
    </div>
  );
}
