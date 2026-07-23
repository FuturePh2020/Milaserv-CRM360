"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch, apiUrl } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/auth";

interface ConvertedLeadRow {
  leadId: string;
  type: string;
  customerName: string | null;
  maskedPhone: string;
  maskedIdentity: string | null;
  agent: { id: string; fullName: string } | null;
  contactTime: string | null;
  externalOrderNumber: string | null;
  conversionTimestamp: string | null;
  cdrVerification: string | null;
  providerLastStatus: string | null;
  batchId: string;
  partner: string | null;
}

interface ConvertedLeadsResponse {
  rows: ConvertedLeadRow[];
  total: number;
  page: number;
  perPage: number;
}

export default function ConvertedLeadsPage() {
  const [isExporting, setIsExporting] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboards", "converted-leads"],
    queryFn: () => apiFetch<ConvertedLeadsResponse>("/dashboards/converted-leads?perPage=50"),
  });

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch(apiUrl("/dashboards/converted-leads/export"), {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        credentials: "include",
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "converted-leads.csv";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-navy">Converted Leads</h1>
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="rounded-md border border-teal px-3 py-1.5 text-sm font-medium text-teal hover:bg-teal hover:text-white focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-60"
        >
          {isExporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {isLoading && <p className="text-muted-slate">Loading…</p>}
      {isError && <p className="text-danger">Could not load converted leads.</p>}

      {data && (
        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Order #</th>
                <th className="px-3 py-2 font-medium">Converted</th>
                <th className="px-3 py-2 font-medium">CDR Verification</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-slate">
                    No converted leads yet.
                  </td>
                </tr>
              )}
              {data.rows.map((row) => (
                <tr key={row.leadId} className="border-t border-border">
                  <td className="px-3 py-2">{row.type}</td>
                  <td className="px-3 py-2">{row.customerName ?? "—"}</td>
                  <td className="px-3 py-2">{row.maskedPhone}</td>
                  <td className="px-3 py-2">{row.agent?.fullName ?? "—"}</td>
                  <td className="px-3 py-2">{row.externalOrderNumber ?? "—"}</td>
                  <td className="px-3 py-2">
                    {row.conversionTimestamp ? new Date(row.conversionTimestamp).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {row.cdrVerification ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.cdrVerification === "MATCHED"
                            ? "bg-success/10 text-success"
                            : "bg-amber/10 text-amber"
                        }`}
                      >
                        {row.cdrVerification}
                      </span>
                    ) : (
                      <span className="text-muted-slate">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
