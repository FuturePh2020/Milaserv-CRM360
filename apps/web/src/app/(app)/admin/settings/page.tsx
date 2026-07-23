"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../../lib/api-client";

interface SettingRow {
  key: string;
  value: unknown;
  updatedAt: string | null;
}

const SETTING_LABELS: Record<string, string> = {
  cdrDefaultSourceTimezone: "CDR Default Source Timezone",
  dashboardBreakAllowanceMinutes: "Break Allowance (minutes)",
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<SettingRow[]>("/settings"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiFetch(`/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">Settings</h1>
      <p className="mb-4 text-sm text-muted-slate">
        Runtime overrides for the environment-variable defaults used elsewhere in the app.
      </p>

      {isLoading && <p className="text-muted-slate">Loading…</p>}
      {isError && <p className="text-danger">Could not load settings.</p>}

      {data && (
        <div className="flex flex-col gap-3">
          {data.map((setting) => (
            <div key={setting.key} className="rounded-card border border-border bg-white p-4 shadow-sm">
              <label className="mb-1 block text-sm font-medium text-app-text">
                {SETTING_LABELS[setting.key] ?? setting.key}
              </label>
              <div className="flex gap-2">
                <input
                  defaultValue={typeof setting.value === "string" ? setting.value : (setting.value as any) ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [setting.key]: e.target.value }))}
                  className="w-full max-w-sm rounded-md border border-border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-teal"
                />
                <button
                  onClick={() => {
                    const raw = drafts[setting.key] ?? setting.value;
                    const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
                    updateMutation.mutate({ key: setting.key, value });
                  }}
                  disabled={updateMutation.isPending}
                  className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal disabled:opacity-60"
                >
                  Save
                </button>
              </div>
              {setting.updatedAt && (
                <p className="mt-1 text-xs text-muted-slate">
                  Last updated {new Date(setting.updatedAt).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
