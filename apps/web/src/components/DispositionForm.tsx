"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api-client";
import { DISPOSITION_LABELS, type DispositionType } from "../lib/types";

const DISPOSITION_OPTIONS = Object.keys(DISPOSITION_LABELS) as DispositionType[];

export function DispositionForm({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [disposition, setDisposition] = useState<DispositionType | "">("");
  const [notes, setNotes] = useState("");
  const [externalOrderNumber, setExternalOrderNumber] = useState("");
  const [lastDispenseDate, setLastDispenseDate] = useState("");
  const [refillPeriodDays, setRefillPeriodDays] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpPeriod, setFollowUpPeriod] = useState<"MORNING" | "EVENING" | "">("");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/leads/${leadId}/disposition`, {
        method: "POST",
        body: JSON.stringify({
          disposition,
          notes: notes || undefined,
          ...(disposition === "ORDER_CREATED" && { externalOrderNumber }),
          ...(disposition === "ALREADY_DISPENSED" && {
            lastDispenseDate,
            refillPeriodDays: Number(refillPeriodDays),
          }),
          ...(disposition === "RESCHEDULE_FOLLOW_UP" && { followUpDate, followUpPeriod }),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads", "active"] });
      queryClient.invalidateQueries({ queryKey: ["dashboards", "me", "daily"] });
      setDisposition("");
      setNotes("");
      setExternalOrderNumber("");
      setLastDispenseDate("");
      setRefillPeriodDays("");
      setFollowUpDate("");
      setFollowUpPeriod("");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-card border border-border bg-white p-4 shadow-sm">
      <h3 className="mb-3 font-semibold text-navy">Save Disposition</h3>

      <label className="mb-1 block text-sm font-medium text-app-text" htmlFor="disposition">
        Disposition
      </label>
      <select
        id="disposition"
        required
        value={disposition}
        onChange={(e) => setDisposition(e.target.value as DispositionType)}
        className="mb-3 w-full rounded-md border border-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-teal"
      >
        <option value="" disabled>
          Select a disposition…
        </option>
        {DISPOSITION_OPTIONS.map((key) => (
          <option key={key} value={key}>
            {DISPOSITION_LABELS[key]}
          </option>
        ))}
      </select>

      {disposition === "ORDER_CREATED" && (
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-app-text" htmlFor="externalOrderNumber">
            External Order Number
          </label>
          <input
            id="externalOrderNumber"
            required
            value={externalOrderNumber}
            onChange={(e) => setExternalOrderNumber(e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>
      )}

      {disposition === "ALREADY_DISPENSED" && (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-app-text" htmlFor="lastDispenseDate">
              Last Dispense Date
            </label>
            <input
              id="lastDispenseDate"
              type="date"
              required
              value={lastDispenseDate}
              onChange={(e) => setLastDispenseDate(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-teal"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-app-text" htmlFor="refillPeriodDays">
              Refill Period (26-80 days)
            </label>
            <input
              id="refillPeriodDays"
              type="number"
              min={26}
              max={80}
              required
              value={refillPeriodDays}
              onChange={(e) => setRefillPeriodDays(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-teal"
            />
          </div>
        </div>
      )}

      {disposition === "RESCHEDULE_FOLLOW_UP" && (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-app-text" htmlFor="followUpDate">
              Follow-up Date
            </label>
            <input
              id="followUpDate"
              type="date"
              required
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full rounded-md border border-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-teal"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-app-text" htmlFor="followUpPeriod">
              Period
            </label>
            <select
              id="followUpPeriod"
              required
              value={followUpPeriod}
              onChange={(e) => setFollowUpPeriod(e.target.value as "MORNING" | "EVENING")}
              className="w-full rounded-md border border-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-teal"
            >
              <option value="" disabled>
                Select…
              </option>
              <option value="MORNING">Morning</option>
              <option value="EVENING">Evening</option>
            </select>
          </div>
        </div>
      )}

      <label className="mb-1 block text-sm font-medium text-app-text" htmlFor="notes">
        Notes (optional)
      </label>
      <textarea
        id="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="mb-3 w-full rounded-md border border-border px-3 py-2 focus-visible:ring-2 focus-visible:ring-teal"
      />

      {saveMutation.isError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {saveMutation.error instanceof Error ? saveMutation.error.message : "Could not save disposition."}
        </p>
      )}

      <button
        type="submit"
        disabled={!disposition || saveMutation.isPending}
        className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal focus-visible:ring-2 focus-visible:ring-deep-teal disabled:opacity-60"
      >
        {saveMutation.isPending ? "Saving…" : "Save Disposition"}
      </button>
    </form>
  );
}
