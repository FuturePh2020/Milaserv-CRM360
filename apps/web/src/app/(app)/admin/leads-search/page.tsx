"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../../../lib/api-client";

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
  phone?: string;
  identity?: string | null;
  leads: SearchLeadResult[];
}

// Admin Leads Search (spec 2.1 "View all ... leads") - unlike the Agent
// route, unmasked and not permission-filtered, since Team Leader/Shift
// Supervisor "view all leads and reports".
export default function AdminLeadsSearchPage() {
  const [input, setInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);

  const searchQuery = useQuery({
    queryKey: ["leads-search-admin", submittedQuery],
    queryFn: () =>
      apiFetch<{ households: SearchHousehold[] }>(`/leads-search/admin?query=${encodeURIComponent(submittedQuery!)}`),
    enabled: submittedQuery !== null && submittedQuery.length >= 3,
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
      {searchQuery.data?.households.length === 0 && <p className="text-muted-slate">No matches found.</p>}

      <div className="flex flex-col gap-3">
        {searchQuery.data?.households.map((household) => (
          <div key={household.personId} className="rounded-card border border-border bg-white p-4 shadow-sm">
            <p className="font-semibold text-navy">{household.customerName ?? "Unnamed customer"}</p>
            <p className="mb-2 text-sm text-muted-slate">
              {household.phone}
              {household.identity ? ` · ID ${household.identity}` : ""}
            </p>
            <ul className="flex flex-col gap-2">
              {household.leads.map((lead) => (
                <li key={lead.leadId} className="rounded-md border border-border px-3 py-2 text-sm">
                  {lead.type} · {lead.branchCode ?? lead.city ?? "—"} · {lead.status}
                  {lead.hasActiveOwner && <span className="ml-2 text-muted-slate">(owned)</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
