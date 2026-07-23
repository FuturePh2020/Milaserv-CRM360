"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api-client";
import { StatCard } from "./StatCard";
import type { LeadType } from "../lib/types";

interface LeadsSummaryResponse {
  leadType: LeadType;
  total: number;
  available: number;
  assigned: number;
  pendingCall: number;
  customerContacted: number;
  callbackEligible: number;
  followUpScheduled: number;
  completed: number;
  remaining: number;
  completionPercentage: number;
  ordersCreated: number;
  convertedLeadCount: number;
  dispositionCounts: Record<string, number>;
}

export function LeadsSummaryCard({ leadType }: { leadType: LeadType }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboards", "leads-summary", leadType],
    queryFn: () => apiFetch<LeadsSummaryResponse>(`/dashboards/leads-summary?leadType=${leadType}`),
    refetchInterval: 15000,
  });

  if (isLoading) return <p className="text-muted-slate">Loading…</p>;
  if (isError || !data) return <p className="text-danger">Could not load {leadType} summary.</p>;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total" value={data.total} />
        <StatCard label="Available" value={data.available} />
        <StatCard label="Assigned" value={data.assigned} />
        <StatCard label="Pending Call" value={data.pendingCall} />
        <StatCard label="Customer Contacted" value={data.customerContacted} />
        <StatCard label="Callback Eligible" value={data.callbackEligible} tone="amber" />
        <StatCard label="Follow-up Scheduled" value={data.followUpScheduled} tone="amber" />
        <StatCard label="Completed" value={data.completed} tone="success" />
        <StatCard label="Remaining" value={data.remaining} />
        <StatCard label="Completion %" value={`${data.completionPercentage}%`} />
        <StatCard label="Orders Created" value={data.ordersCreated} tone="success" />
        <StatCard label="Converted" value={data.convertedLeadCount} tone="success" />
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-slate">Disposition Breakdown</h2>
      <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-3 py-2 font-medium">Disposition</th>
              <th className="px-3 py-2 font-medium">Count</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.dispositionCounts).length === 0 && (
              <tr>
                <td colSpan={2} className="px-3 py-4 text-center text-muted-slate">
                  No dispositions recorded yet.
                </td>
              </tr>
            )}
            {Object.entries(data.dispositionCounts).map(([key, count]) => (
              <tr key={key} className="border-t border-border">
                <td className="px-3 py-2">{key}</td>
                <td className="px-3 py-2">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
