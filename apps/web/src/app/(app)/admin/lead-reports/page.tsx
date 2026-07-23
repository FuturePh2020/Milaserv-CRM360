"use client";

import { LeadsSummaryCard } from "../../../../components/LeadsSummaryCard";

export default function LeadReportsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Lead Reports</h1>

      <h2 className="mb-2 text-lg font-semibold text-navy">Cash</h2>
      <div className="mb-8">
        <LeadsSummaryCard leadType="CASH" />
      </div>

      <h2 className="mb-2 text-lg font-semibold text-navy">Insurance</h2>
      <LeadsSummaryCard leadType="INSURANCE" />
    </div>
  );
}
