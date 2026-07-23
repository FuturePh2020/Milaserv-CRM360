"use client";

import { LeadDistributorPanel } from "../../../../../components/LeadDistributorPanel";

export default function CashLeadsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Cash Leads</h1>
      <LeadDistributorPanel restrictType="CASH" />
    </div>
  );
}
