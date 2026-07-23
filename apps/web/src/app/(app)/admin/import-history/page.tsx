"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "../../../../lib/api-client";
import { getAccessToken } from "../../../../lib/auth";

interface BatchRow {
  id: string;
  sourceType: string;
  leadType: string | null;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdAt: string;
  file: { originalName: string };
}

async function downloadErrors(batchId: string, fileName: string) {
  const res = await fetch(apiUrl(`/imports/batches/${batchId}/errors/export`), {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
    credentials: "include",
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ImportHistoryPage() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["import-batches"],
    queryFn: () => apiFetch<BatchRow[]>("/imports/batches"),
    refetchInterval: 10000,
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Import History</h1>
      {isLoading && <p className="text-muted-slate">Loading…</p>}
      {isError && <p className="text-danger">Could not load import history.</p>}

      {data && (
        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Rows</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Errors</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-slate">
                    No imports yet.
                  </td>
                </tr>
              )}
              {data.map((batch) => (
                <tr key={batch.id} className="border-t border-border">
                  <td className="px-3 py-2">{batch.file.originalName}</td>
                  <td className="px-3 py-2">
                    {batch.sourceType}
                    {batch.leadType ? ` (${batch.leadType})` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        batch.status === "COMPLETED"
                          ? "bg-success/10 text-success"
                          : batch.status === "COMPLETED_WITH_ERRORS"
                            ? "bg-amber/10 text-amber"
                            : batch.status === "FAILED"
                              ? "bg-danger/10 text-danger"
                              : "bg-app-bg text-app-text"
                      }`}
                    >
                      {batch.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {batch.validRows}/{batch.totalRows} valid
                  </td>
                  <td className="px-3 py-2">{new Date(batch.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {batch.invalidRows > 0 && (
                      <button
                        onClick={async () => {
                          setDownloadingId(batch.id);
                          await downloadErrors(batch.id, `import-${batch.id}-errors.csv`);
                          setDownloadingId(null);
                        }}
                        disabled={downloadingId === batch.id}
                        className="rounded-md border border-teal px-2 py-1 text-xs font-medium text-teal hover:bg-teal hover:text-white disabled:opacity-60"
                      >
                        Export CSV
                      </button>
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
