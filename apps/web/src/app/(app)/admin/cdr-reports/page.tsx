"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api-client";
import { StatCard } from "../../../../components/StatCard";

interface CdrReportRecord {
  cdrRecordId: string;
  callStartedAt: string;
  direction: string;
  customerPhoneNormalized: string | null;
  agentExtension: string | null;
  callDurationSeconds: number;
  matchStatus: string | null;
  leadType: string | null;
  customerName: string | null;
  matchedAgentName: string | null;
}

interface ExtensionMapping {
  extension: string;
  displayName: string | null;
  isSystem: boolean;
  user: { id: string; fullName: string } | null;
}

const MATCH_TONE: Record<string, string> = {
  MATCHED: "bg-success/10 text-success",
  NOT_MATCHED: "bg-app-bg text-app-text",
  AMBIGUOUS: "bg-amber/10 text-amber",
  AGENT_MISMATCH: "bg-danger/10 text-danger",
  UNMAPPED_EXTENSION: "bg-amber/10 text-amber",
  OUTSIDE_ASSIGNMENT_WINDOW: "bg-app-bg text-app-text",
};

function CdrReportsContent() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batchId");
  const queryClient = useQueryClient();

  const reportQuery = useQuery({
    queryKey: ["cdr-report", batchId],
    queryFn: () => apiFetch<{ summary: any; records: CdrReportRecord[] }>(`/imports/batches/${batchId}/cdr-report`),
    enabled: !!batchId,
  });

  const mappingsQuery = useQuery({
    queryKey: ["extension-mappings"],
    queryFn: () => apiFetch<ExtensionMapping[]>("/extension-mappings"),
  });

  const [userIdByExtension, setUserIdByExtension] = useState<Record<string, string>>({});
  const assignMutation = useMutation({
    mutationFn: ({ extension, userId }: { extension: string; userId: string }) =>
      apiFetch(`/extension-mappings/${extension}`, { method: "PATCH", body: JSON.stringify({ userId: userId || null }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["extension-mappings"] }),
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">CDR Matching Reports</h1>

      {!batchId && <p className="text-muted-slate">Choose a batch from Yeastar CDR Imports to view its report.</p>}

      {reportQuery.data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total Rows" value={reportQuery.data.summary.totalRows} />
            <StatCard label="Matched" value={reportQuery.data.summary.matchedRows} tone="success" />
            <StatCard label="Unmatched" value={reportQuery.data.summary.unmatchedRows} />
            <StatCard label="Ambiguous" value={reportQuery.data.summary.ambiguousRows} tone="amber" />
          </div>

          <div className="mb-8 overflow-x-auto rounded-card border border-border bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-navy text-white">
                <tr>
                  <th className="px-3 py-2 font-medium">Call Started</th>
                  <th className="px-3 py-2 font-medium">Direction</th>
                  <th className="px-3 py-2 font-medium">Extension</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Match Status</th>
                </tr>
              </thead>
              <tbody>
                {reportQuery.data.records.slice(0, 200).map((row) => (
                  <tr key={row.cdrRecordId} className="border-t border-border">
                    <td className="px-3 py-2">{new Date(row.callStartedAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{row.direction}</td>
                    <td className="px-3 py-2">{row.agentExtension ?? "—"}</td>
                    <td className="px-3 py-2">{row.customerName ?? row.customerPhoneNormalized ?? "—"}</td>
                    <td className="px-3 py-2">{row.matchedAgentName ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.matchStatus && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${MATCH_TONE[row.matchStatus] ?? ""}`}>
                          {row.matchStatus}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className="mb-2 text-lg font-semibold text-navy">Extension Mappings</h2>
      <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-3 py-2 font-medium">Extension</th>
              <th className="px-3 py-2 font-medium">Display Name</th>
              <th className="px-3 py-2 font-medium">System</th>
              <th className="px-3 py-2 font-medium">Assigned Agent (User ID)</th>
            </tr>
          </thead>
          <tbody>
            {mappingsQuery.data?.map((mapping) => (
              <tr key={mapping.extension} className="border-t border-border">
                <td className="px-3 py-2">{mapping.extension}</td>
                <td className="px-3 py-2">{mapping.displayName ?? "—"}</td>
                <td className="px-3 py-2">{mapping.isSystem ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <input
                      placeholder={mapping.user?.id ?? "user id…"}
                      value={userIdByExtension[mapping.extension] ?? ""}
                      onChange={(e) =>
                        setUserIdByExtension((prev) => ({ ...prev, [mapping.extension]: e.target.value }))
                      }
                      className="w-56 rounded-md border border-border px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() =>
                        assignMutation.mutate({
                          extension: mapping.extension,
                          userId: userIdByExtension[mapping.extension] ?? "",
                        })
                      }
                      className="rounded-md border border-teal px-2 py-1 text-xs font-medium text-teal hover:bg-teal hover:text-white"
                    >
                      Assign
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CdrReportsPage() {
  return (
    <Suspense fallback={<p className="text-muted-slate">Loading…</p>}>
      <CdrReportsContent />
    </Suspense>
  );
}
