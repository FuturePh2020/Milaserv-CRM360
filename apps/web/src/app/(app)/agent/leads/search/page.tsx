"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../../../../lib/api-client";

interface SearchLeadResult {
  leadId: string;
  type: string;
  branchCode: string | null;
  city: string | null;
  status: string;
  hasActiveOwner: boolean;
  callbackEligible: boolean;
}

interface SearchHousehold {
  personId: string;
  customerName: string | null;
  maskedPhone: string;
  maskedIdentity: string | null;
  leads: SearchLeadResult[];
}

export default function AgentLeadsSearchPage() {
  const [input, setInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const searchQuery = useQuery({
    queryKey: ["leads-search", submittedQuery],
    queryFn: () => apiFetch<{ households: SearchHousehold[] }>(`/leads-search?query=${encodeURIComponent(submittedQuery!)}`),
    enabled: submittedQuery !== null && submittedQuery.length >= 3,
  });

  const takeMutation = useMutation({
    mutationFn: (leadId: string) => apiFetch(`/leads/${leadId}/take`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", "active"] });
      queryClient.invalidateQueries({ queryKey: ["leads-search"] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedQuery(input.trim());
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Leads Search</h1>

      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Phone number or national ID…"
          className="w-full max-w-sm rounded-md border border-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-teal"
        />
        <button
          type="submit"
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal focus-visible:ring-2 focus-visible:ring-deep-teal"
        >
          Search
        </button>
      </form>

      {searchQuery.isLoading && <p className="text-muted-slate">Searching…</p>}
      {searchQuery.isError && (
        <p role="alert" className="text-danger">
          {searchQuery.error instanceof ApiError ? searchQuery.error.message : "Search failed."}
        </p>
      )}
      {takeMutation.isError && (
        <p role="alert" className="mb-3 text-danger">
          {takeMutation.error instanceof Error ? takeMutation.error.message : "Could not take lead."}
        </p>
      )}

      {searchQuery.data?.households.length === 0 && <p className="text-muted-slate">No matches found.</p>}

      <div className="flex flex-col gap-3">
        {searchQuery.data?.households.map((household) => (
          <div key={household.personId} className="rounded-card border border-border bg-white p-4 shadow-sm">
            <p className="font-semibold text-navy">{household.customerName ?? "Unnamed customer"}</p>
            <p className="mb-2 text-sm text-muted-slate">
              {household.maskedPhone}
              {household.maskedIdentity ? ` · ID ${household.maskedIdentity}` : ""}
            </p>
            {household.leads.length === 0 ? (
              <p className="text-sm text-muted-slate">No leads permitted for you to view.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {household.leads.map((lead) => (
                  <li
                    key={lead.leadId}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span>
                      {lead.type} · {lead.branchCode ?? lead.city ?? "—"} ·{" "}
                      <span className={lead.hasActiveOwner ? "text-muted-slate" : "text-app-text"}>
                        {lead.status}
                      </span>
                    </span>
                    {lead.callbackEligible && !lead.hasActiveOwner && (
                      <button
                        onClick={() => takeMutation.mutate(lead.leadId)}
                        disabled={takeMutation.isPending}
                        className="rounded-md bg-teal px-3 py-1 text-xs font-medium text-white hover:bg-deep-teal disabled:opacity-60"
                      >
                        Take Lead
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
