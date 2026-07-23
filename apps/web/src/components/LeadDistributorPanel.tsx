"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../lib/api-client";
import type { LeadDetail, LeadType } from "../lib/types";
import { ActiveLeadCard } from "./ActiveLeadCard";

export function LeadDistributorPanel({ restrictType }: { restrictType?: LeadType }) {
  const queryClient = useQueryClient();

  const activeLeadQuery = useQuery({
    queryKey: ["leads", "active"],
    queryFn: () => apiFetch<LeadDetail | null>("/leads/active"),
    refetchInterval: 15000,
  });

  const generateMutation = useMutation({
    mutationFn: (leadType: LeadType) =>
      apiFetch("/leads/generate", { method: "POST", body: JSON.stringify({ leadType }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads", "active"] }),
  });

  if (activeLeadQuery.isLoading) {
    return <p className="text-muted-slate">Loading…</p>;
  }

  const lead = activeLeadQuery.data;

  if (lead) {
    if (restrictType && lead.type !== restrictType) {
      return (
        <div className="rounded-card border border-border bg-white p-4 shadow-sm">
          <p className="text-app-text">
            You have an active {lead.type} lead - complete it before generating a {restrictType} lead.
          </p>
        </div>
      );
    }
    return <ActiveLeadCard lead={lead} />;
  }

  const errorMessage =
    generateMutation.error instanceof ApiError
      ? generateMutation.error.message
      : generateMutation.error instanceof Error
        ? generateMutation.error.message
        : null;

  return (
    <div className="rounded-card border border-border bg-white p-6 text-center shadow-sm">
      <p className="mb-4 text-app-text">No active lead. Generate one to get started.</p>
      <div className="flex justify-center gap-3">
        {(!restrictType || restrictType === "CASH") && (
          <button
            onClick={() => generateMutation.mutate("CASH")}
            disabled={generateMutation.isPending}
            className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal focus-visible:ring-2 focus-visible:ring-deep-teal disabled:opacity-60"
          >
            Generate Cash Lead
          </button>
        )}
        {(!restrictType || restrictType === "INSURANCE") && (
          <button
            onClick={() => generateMutation.mutate("INSURANCE")}
            disabled={generateMutation.isPending}
            className="rounded-md border border-teal px-4 py-2 text-sm font-medium text-teal hover:bg-teal hover:text-white disabled:opacity-60"
          >
            Generate Insurance Lead
          </button>
        )}
      </div>
      {errorMessage && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
