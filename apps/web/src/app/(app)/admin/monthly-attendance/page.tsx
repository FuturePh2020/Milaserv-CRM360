"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api-client";

interface MonthlyRow {
  userId: string;
  fullName: string;
  daysRecorded: number;
  totalWorkSeconds: number;
  totalBreakSeconds: number;
  statusCounts: Record<string, number>;
}

function formatHours(seconds: number): string {
  return `${Math.round((seconds / 3600) * 10) / 10}h`;
}

export default function MonthlyAttendancePage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const { data, isLoading, isError } = useQuery({
    queryKey: ["attendance", "monthly", month],
    queryFn: () => apiFetch<MonthlyRow[]>(`/attendance/monthly?month=${month}`),
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Monthly Attendance</h1>

      <div className="mb-4">
        <label className="mb-1 block text-xs text-muted-slate" htmlFor="month">
          Month
        </label>
        <input
          id="month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>

      {isLoading && <p className="text-muted-slate">Loading…</p>}
      {isError && <p className="text-danger">Could not load monthly attendance.</p>}

      {data && (
        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-3 py-2 font-medium">Agent</th>
                <th className="px-3 py-2 font-medium">Days Recorded</th>
                <th className="px-3 py-2 font-medium">Work Time</th>
                <th className="px-3 py-2 font-medium">Break Time</th>
                <th className="px-3 py-2 font-medium">Present</th>
                <th className="px-3 py-2 font-medium">Worked No Break</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-slate">
                    No attendance recorded for this month.
                  </td>
                </tr>
              )}
              {data.map((row) => (
                <tr key={row.userId} className="border-t border-border">
                  <td className="px-3 py-2">{row.fullName}</td>
                  <td className="px-3 py-2">{row.daysRecorded}</td>
                  <td className="px-3 py-2">{formatHours(row.totalWorkSeconds)}</td>
                  <td className="px-3 py-2">{formatHours(row.totalBreakSeconds)}</td>
                  <td className="px-3 py-2">{row.statusCounts.PRESENT ?? 0}</td>
                  <td className="px-3 py-2">{row.statusCounts.WORKED_NO_BREAK ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
