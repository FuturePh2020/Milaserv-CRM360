"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api-client";

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: { fullName: string; email: string } | null;
}

export default function AuditLogPage() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 25;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit-log", action, entityType, page],
    queryFn: () =>
      apiFetch<{ rows: AuditLogRow[]; total: number }>(
        `/audit-log?page=${page}&perPage=${perPage}${action ? `&action=${encodeURIComponent(action)}` : ""}${
          entityType ? `&entityType=${encodeURIComponent(entityType)}` : ""
        }`,
      ),
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Audit Log</h1>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          placeholder="Filter by action (e.g. LEAD_GENERATED)…"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-teal"
        />
        <input
          placeholder="Filter by entity type (e.g. Lead)…"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-teal"
        />
      </div>

      {isLoading && <p className="text-muted-slate">Loading…</p>}
      {isError && <p className="text-danger">Could not load the audit log.</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-navy text-white">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Entity</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-slate">
                      No matching audit entries.
                    </td>
                  </tr>
                )}
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{row.actor?.fullName ?? "System"}</td>
                    <td className="px-3 py-2">{row.action}</td>
                    <td className="px-3 py-2">
                      {row.entityType}
                      {row.entityId ? ` (${row.entityId.slice(0, 8)}…)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-slate">
              Page {page} of {Math.max(1, Math.ceil(data.total / perPage))} ({data.total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border border-border px-3 py-1 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * perPage >= data.total}
                className="rounded-md border border-border px-3 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
