"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiUrl } from "../lib/api-client";
import { getAccessToken } from "../lib/auth";

interface BatchStatus {
  id: string;
  status: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
}

export function ImportUploadFlow({
  sourceType,
  leadType,
}: {
  sourceType: "CASH" | "INSURANCE" | "CDR";
  leadType?: "CASH" | "INSURANCE";
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [sourceTimezone, setSourceTimezone] = useState("Asia/Riyadh");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "previewing" | "confirmed">("idle");
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const [demoAcknowledged, setDemoAcknowledged] = useState(false);

  const batchQuery = useQuery({
    queryKey: ["import-batch", batchId],
    queryFn: () => apiFetch<BatchStatus>(`/imports/batches/${batchId}`),
    enabled: !!batchId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "PROCESSING" || status === "QUEUED" ? 3000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = fileInputRef.current?.files?.[0];
      if (!file) throw new Error("Choose a file first.");
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch(apiUrl("/imports/files"), {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        credentials: "include",
        body: form,
      });
      const uploadBody = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadBody.message ?? "Upload failed.");

      const batch = await apiFetch<{ id: string }>("/imports/batches", {
        method: "POST",
        body: JSON.stringify({
          fileId: uploadBody.file.id,
          sourceType,
          ...(leadType && { leadType }),
          ...(sourceType !== "CDR" && { dateFormat }),
          ...(sourceType === "CDR" && { sourceTimezone }),
        }),
      });
      setBatchId(batch.id);
      setStep("previewing");
      await apiFetch(`/imports/batches/${batch.id}/preview`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["import-batch", batch.id] });
      return batch;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => apiFetch(`/imports/batches/${batchId}/confirm`, { method: "POST" }),
    onSuccess: () => {
      setStep("confirmed");
      queryClient.invalidateQueries({ queryKey: ["import-batch", batchId] });
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
    },
  });

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-semibold text-navy">Upload {sourceType === "CDR" ? "Yeastar CDR" : leadType} File</h3>

      {isDemoMode && (
        <label className="mb-3 flex items-start gap-2 rounded-md bg-amber/10 p-3 text-sm text-app-text">
          <input
            type="checkbox"
            checked={demoAcknowledged}
            onChange={(e) => setDemoAcknowledged(e.target.checked)}
            className="mt-0.5"
          />
          This is a public demo environment. I confirm this file contains test data only — no real
          customer, medical, phone, national ID, or payment information.
        </label>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="text-sm"
          disabled={step !== "idle" || (isDemoMode && !demoAcknowledged)}
        />
        {sourceType !== "CDR" ? (
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Date Format</label>
            <select
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              disabled={step !== "idle"}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-muted-slate">Source Timezone</label>
            <input
              value={sourceTimezone}
              onChange={(e) => setSourceTimezone(e.target.value)}
              disabled={step !== "idle"}
              className="rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </div>
        )}
        <button
          onClick={() => uploadMutation.mutate()}
          disabled={step !== "idle" || uploadMutation.isPending || (isDemoMode && !demoAcknowledged)}
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal disabled:opacity-60"
        >
          {uploadMutation.isPending ? "Uploading & Previewing…" : "Upload & Preview"}
        </button>
      </div>

      {uploadMutation.isError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {uploadMutation.error instanceof Error ? uploadMutation.error.message : "Upload failed."}
        </p>
      )}

      {batchQuery.data && (
        <div className="mb-3 rounded-md bg-app-bg p-3 text-sm">
          <p>
            Status: <strong>{batchQuery.data.status}</strong>
          </p>
          <p>
            {batchQuery.data.validRows} valid / {batchQuery.data.invalidRows} invalid /{" "}
            {batchQuery.data.duplicateRows} duplicate of {batchQuery.data.totalRows} total rows
          </p>
        </div>
      )}

      {step === "previewing" && batchQuery.data?.status === "PREVIEW_READY" && (
        <button
          onClick={() => confirmMutation.mutate()}
          disabled={confirmMutation.isPending}
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal disabled:opacity-60"
        >
          {confirmMutation.isPending ? "Confirming…" : "Confirm Import"}
        </button>
      )}

      {confirmMutation.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {confirmMutation.error instanceof Error ? confirmMutation.error.message : "Confirm failed."}
        </p>
      )}

      {(batchQuery.data?.status === "COMPLETED" || batchQuery.data?.status === "COMPLETED_WITH_ERRORS") && (
        <p className="mt-2 text-sm font-medium text-success">Import finished - {batchQuery.data.status}.</p>
      )}
    </div>
  );
}
