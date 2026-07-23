"use client";

import { LeadsSummaryCard } from "../../../../components/LeadsSummaryCard";

export default function AdminLeadsDistributorPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Leads Distributor</h1>
      <p className="mb-4 text-sm text-muted-slate">
        Live view of the shared lead pool both lead types draw from - Agents claim from here via Generate/Take Lead.
      </p>

      <h2 className="mb-2 text-lg font-semibold text-navy">Cash</h2>
      <div className="mb-8">
        <LeadsSummaryCard leadType="CASH" />
      </div>

      <h2 className="mb-2 text-lg font-semibold text-navy">Insurance</h2>
      <LeadsSummaryCard leadType="INSURANCE" />
    </div>
  );
}
