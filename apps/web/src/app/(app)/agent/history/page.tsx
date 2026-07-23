"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api-client";

interface WorkSessionRow {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  totalWorkSeconds: number;
  totalBreakSeconds: number;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  ON_MANUAL_BREAK: "On Manual Break",
  ON_IDLE_BREAK: "On Idle Break",
  ENDED: "Ended",
  FORCE_CLOSED: "Force Closed",
};

export default function MySessionHistoryPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sessions", "history"],
    queryFn: () => apiFetch<{ rows: WorkSessionRow[]; total: number }>("/sessions/history?perPage=50"),
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">My Session History</h1>
      {isLoading && <p className="text-muted-slate">Loading…</p>}
      {isError && <p className="text-danger">Could not load session history.</p>}
      {data && (
        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Ended</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Work Time</th>
                <th className="px-3 py-2 font-medium">Break Time</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-slate">
                    No sessions recorded yet.
                  </td>
                </tr>
              )}
              {data.rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">{new Date(row.startedAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.endedAt ? new Date(row.endedAt).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[row.status] ?? row.status}</td>
                  <td className="px-3 py-2">{formatDuration(row.totalWorkSeconds)}</td>
                  <td className="px-3 py-2">{formatDuration(row.totalBreakSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
