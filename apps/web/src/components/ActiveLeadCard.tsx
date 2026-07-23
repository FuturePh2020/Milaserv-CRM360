"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api-client";
import type { LeadDetail } from "../lib/types";
import { DispositionForm } from "./DispositionForm";

const STATUS_LABEL: Record<string, string> = {
  PENDING_CALL: "Pending Call",
  CUSTOMER_CONTACTED: "Customer Contacted",
  CALLBACK_ELIGIBLE: "Callback Eligible",
  FOLLOW_UP_SCHEDULED: "Follow-up Scheduled",
};

export function ActiveLeadCard({ lead }: { lead: LeadDetail }) {
  const queryClient = useQueryClient();

  const callMutation = useMutation({
    mutationFn: () => apiFetch(`/leads/${lead.id}/call`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads", "active"] }),
  });

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-slate">
            {lead.type} · {STATUS_LABEL[lead.status] ?? lead.status}
          </p>
          <p className="text-lg font-semibold text-navy">{lead.person.fullName ?? "Unnamed customer"}</p>
        </div>
        {lead.status === "PENDING_CALL" && (
          <button
            onClick={() => callMutation.mutate()}
            disabled={callMutation.isPending}
            className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal focus-visible:ring-2 focus-visible:ring-deep-teal disabled:opacity-60"
          >
            {callMutation.isPending ? "Calling…" : "Call Customer"}
          </button>
        )}
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-slate">Phone</dt>
          <dd className="text-app-text">{lead.person.phoneRaw}</dd>
        </div>
        <div>
          <dt className="text-muted-slate">Branch</dt>
          <dd className="text-app-text">{lead.branchCode ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-slate">City</dt>
          <dd className="text-app-text">{lead.city ?? "—"}</dd>
        </div>
      </dl>

      {lead.medicationItems.length > 0 && (
        <div className="mb-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy text-white">
              <tr>
                <th className="px-3 py-2 font-medium">Medication</th>
                <th className="px-3 py-2 font-medium">Quantity</th>
                <th className="px-3 py-2 font-medium">Item Code</th>
              </tr>
            </thead>
            <tbody>
              {lead.medicationItems.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-3 py-2">{item.medicationName}</td>
                  <td className="px-3 py-2">{item.quantity}</td>
                  <td className="px-3 py-2">{item.itemCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {callMutation.isError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {callMutation.error instanceof Error ? callMutation.error.message : "Could not place the call."}
        </p>
      )}

      {lead.status === "CUSTOMER_CONTACTED" && <DispositionForm leadId={lead.id} />}
    </div>
  );
}
