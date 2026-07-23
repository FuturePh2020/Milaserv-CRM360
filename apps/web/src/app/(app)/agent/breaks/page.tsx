"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api-client";

interface BreakEventRow {
  id: string;
  type: "MANUAL" | "IDLE";
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "In progress";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function MyBreaksPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["sessions", "breaks", "history"],
    queryFn: () => apiFetch<{ rows: BreakEventRow[]; total: number }>("/sessions/breaks/history?perPage=50"),
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">My Breaks</h1>
      {isLoading && <p className="text-muted-slate">Loading…</p>}
      {isError && <p className="text-danger">Could not load break history.</p>}
      {data && (
        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Ended</th>
                <th className="px-3 py-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-slate">
                    No breaks recorded yet.
                  </td>
                </tr>
              )}
              {data.rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.type === "IDLE" ? "bg-amber/10 text-amber" : "bg-app-bg text-app-text"
                      }`}
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{new Date(row.startedAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.endedAt ? new Date(row.endedAt).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2">{formatDuration(row.durationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
