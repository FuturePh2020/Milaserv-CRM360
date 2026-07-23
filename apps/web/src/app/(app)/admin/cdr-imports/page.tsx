"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api-client";
import { ImportUploadFlow } from "../../../../components/ImportUploadFlow";

interface BatchRow {
  id: string;
  status: string;
  totalRows: number;
  validRows: number;
  createdAt: string;
  sourceType: string;
  file: { originalName: string };
}

export default function CdrImportsPage() {
  const { data } = useQuery({
    queryKey: ["import-batches"],
    queryFn: () => apiFetch<{ batches: BatchRow[]; total: number }>("/imports/batches?perPage=100"),
    refetchInterval: 10000,
  });

  const cdrBatches = data?.batches.filter((b) => b.sourceType === "CDR") ?? [];

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Yeastar CDR Imports</h1>

      <div className="mb-6">
        <ImportUploadFlow sourceType="CDR" />
      </div>

      <h2 className="mb-2 text-lg font-semibold text-navy">Recent CDR Batches</h2>
      <div className="overflow-x-auto rounded-card border border-border bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy text-white">
            <tr>
              <th className="px-3 py-2 font-medium">File</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Rows</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium">Report</th>
            </tr>
          </thead>
          <tbody>
            {cdrBatches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-slate">
                  No CDR imports yet.
                </td>
              </tr>
            )}
            {cdrBatches.map((batch) => (
              <tr key={batch.id} className="border-t border-border">
                <td className="px-3 py-2">{batch.file.originalName}</td>
                <td className="px-3 py-2">{batch.status}</td>
                <td className="px-3 py-2">{batch.validRows}/{batch.totalRows}</td>
                <td className="px-3 py-2">{new Date(batch.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/cdr-reports?batchId=${batch.id}`} className="text-teal hover:underline">
                    View Report
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
