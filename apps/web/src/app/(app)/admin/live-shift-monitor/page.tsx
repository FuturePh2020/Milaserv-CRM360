"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api-client";

interface ActiveSessionRow {
  id: string;
  status: string;
  startedAt: string;
  totalBreakSeconds: number;
  user: { id: string; fullName: string; email: string };
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  ON_MANUAL_BREAK: "On Manual Break",
  ON_IDLE_BREAK: "On Idle Break",
};

const BREAK_ALLOWANCE_SECONDS = 3600;

export default function LiveShiftMonitorPage() {
  const queryClient = useQueryClient();
  const [reasonBySession, setReasonBySession] = useState<Record<string, string>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["sessions", "active"],
    queryFn: () => apiFetch<ActiveSessionRow[]>("/sessions/active"),
    refetchInterval: 15000,
  });

  const forceCloseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/sessions/${id}/force-close`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions", "active"] }),
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Live Shift Monitor</h1>
      {isLoading && <p className="text-muted-slate">Loading…</p>}
      {isError && <p className="text-danger">Could not load active sessions.</p>}

      {data && (
        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Break Time</th>
                <th className="px-3 py-2 font-medium">Force Close</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-slate">
                    No active sessions right now.
                  </td>
                </tr>
              )}
              {data.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    {row.user.fullName}
                    <span className="ml-2 text-xs text-muted-slate">{row.user.email}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-amber/10 text-amber"
                      }`}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{new Date(row.startedAt).toLocaleTimeString()}</td>
                  <td className={`px-3 py-2 ${row.totalBreakSeconds > BREAK_ALLOWANCE_SECONDS ? "font-semibold text-danger" : ""}`}>
                    {Math.floor(row.totalBreakSeconds / 60)}m
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <input
                        placeholder="Reason…"
                        value={reasonBySession[row.id] ?? ""}
                        onChange={(e) => setReasonBySession((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        className="w-32 rounded-md border border-border px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-teal"
                      />
                      <button
                        onClick={() =>
                          forceCloseMutation.mutate({ id: row.id, reason: reasonBySession[row.id] ?? "" })
                        }
                        disabled={(reasonBySession[row.id] ?? "").length < 3 || forceCloseMutation.isPending}
                        className="rounded-md border border-danger px-2 py-1 text-xs font-medium text-danger hover:bg-danger hover:text-white disabled:opacity-50"
                      >
                        Close
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {forceCloseMutation.isError && (
        <p role="alert" className="mt-3 text-danger">
          {forceCloseMutation.error instanceof Error ? forceCloseMutation.error.message : "Could not force-close."}
        </p>
      )}
    </div>
  );
}
