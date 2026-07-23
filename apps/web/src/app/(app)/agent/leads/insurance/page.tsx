"use client";

import { LeadDistributorPanel } from "../../../../../components/LeadDistributorPanel";

export default function InsuranceLeadsPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Insurance Leads</h1>
      <LeadDistributorPanel restrictType="INSURANCE" />
    </div>
  );
}
