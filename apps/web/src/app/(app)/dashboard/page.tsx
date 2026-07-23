"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "../../../lib/api-client";
import { StatCard } from "../../../components/StatCard";

interface OverviewResponse {
  activeAgents: number;
  agentsOnManualBreak: number;
  agentsOnIdleBreak: number;
  totalUploadedLeads: number;
  completedLeads: number;
  remainingLeads: number;
  completionPercentage: number;
  contactedLeads: number;
  verifiedCalls: number;
  leadsWithNoVerifiedCalls: number;
  ordersCreated: number;
  agentsOverBreakAllowance: number;
  generatedAt: string;
}

// Spec section 19: 15-second polling fallback (SSE stream exists server-side
// at /dashboards/overview/stream for a future live-update upgrade).
const REFRESH_INTERVAL_MS = 15000;

export default function OverviewPage() {
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ["dashboards", "overview"],
    queryFn: () => apiFetch<OverviewResponse>("/dashboards/overview"),
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-navy">Overview</h1>
        {dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-slate">Updated {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
        )}
      </div>

      {isLoading && <p className="text-muted-slate">Loading…</p>}
      {isError && <p className="text-danger">Could not load the overview. Try refreshing.</p>}

      {data && (
        <>
          <section aria-label="Agent status" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Active Agents" value={data.activeAgents} />
            <StatCard label="On Manual Break" value={data.agentsOnManualBreak} />
            <StatCard label="On Idle Break" value={data.agentsOnIdleBreak} />
            <StatCard
              label="Over Break Allowance"
              value={data.agentsOverBreakAllowance}
              tone={data.agentsOverBreakAllowance > 0 ? "danger" : "default"}
            />
          </section>

          <section aria-label="Lead progress" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Total Uploaded Leads" value={data.totalUploadedLeads} />
            <StatCard label="Completed Leads" value={data.completedLeads} tone="success" />
            <StatCard label="Remaining Leads" value={data.remainingLeads} />
            <StatCard label="Completion %" value={`${data.completionPercentage}%`} />
          </section>

          <section aria-label="Call verification" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard label="Contacted Leads" value={data.contactedLeads} />
            <StatCard label="CDR-Verified Calls" value={data.verifiedCalls} tone="success" />
            <StatCard
              label="No Verified Call"
              value={data.leadsWithNoVerifiedCalls}
              tone={data.leadsWithNoVerifiedCalls > 0 ? "amber" : "default"}
            />
            <StatCard label="Orders Created" value={data.ordersCreated} tone="success" />
          </section>

          <Link
            href="/dashboard/converted-leads"
            className="inline-block rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal focus-visible:ring-2 focus-visible:ring-deep-teal"
          >
            View Converted Leads →
          </Link>
        </>
      )}
    </div>
  );
}
