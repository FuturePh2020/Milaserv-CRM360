"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../lib/api-client";
import { StatCard } from "../../../components/StatCard";

interface WorkSessionResponse {
  id: string;
  status: "ACTIVE" | "ON_MANUAL_BREAK" | "ON_IDLE_BREAK" | "ENDED" | "FORCE_CLOSED";
  startedAt: string;
  endedAt: string | null;
}

interface DailyStatsResponse {
  totalWorkSeconds: number;
  totalBreakSeconds: number;
  manualBreakSeconds: number;
  idleBreakSeconds: number;
  breakCount: number;
  leadsGenerated: number;
  leadsTakenFromSearch: number;
  leadsContacted: number;
  leadsCompleted: number;
  callsInitiated: number;
  cdrVerifiedCalls: number;
  ordersCreated: number;
  currentActiveLeadId: string | null;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

const STATUS_LABEL: Record<WorkSessionResponse["status"], string> = {
  ACTIVE: "Active",
  ON_MANUAL_BREAK: "On Manual Break",
  ON_IDLE_BREAK: "On Idle Break",
  ENDED: "Ended",
  FORCE_CLOSED: "Force Closed",
};

export default function AgentDashboardPage() {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ["sessions", "current"],
    queryFn: () => apiFetch<WorkSessionResponse | null>("/sessions/current"),
    refetchInterval: 15000,
  });

  const dailyStatsQuery = useQuery({
    queryKey: ["dashboards", "me", "daily"],
    queryFn: () => apiFetch<DailyStatsResponse>("/dashboards/me/daily"),
    refetchInterval: 15000,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["sessions", "current"] });
    queryClient.invalidateQueries({ queryKey: ["dashboards", "me", "daily"] });
  }

  const startSession = useMutation({
    mutationFn: () => apiFetch("/sessions/start", { method: "POST" }),
    onSuccess: invalidateAll,
  });
  const endSession = useMutation({
    mutationFn: () => apiFetch("/sessions/end", { method: "POST" }),
    onSuccess: invalidateAll,
  });
  const startBreak = useMutation({
    mutationFn: () => apiFetch("/sessions/breaks/start", { method: "POST" }),
    onSuccess: invalidateAll,
  });
  const endBreak = useMutation({
    mutationFn: () => apiFetch("/sessions/breaks/end", { method: "POST" }),
    onSuccess: invalidateAll,
  });

  const session = sessionQuery.data;
  const stats = dailyStatsQuery.data;
  const mutationError =
    startSession.error || endSession.error || startBreak.error || endBreak.error;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-navy">My Session</h1>

      <div className="mb-6 rounded-card border border-border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-slate">Status</p>
            <p className="mt-1 text-lg font-semibold text-navy">
              {session ? STATUS_LABEL[session.status] : "No active session"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!session && (
              <button
                onClick={() => startSession.mutate()}
                disabled={startSession.isPending}
                className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal focus-visible:ring-2 focus-visible:ring-deep-teal disabled:opacity-60"
              >
                Start Session
              </button>
            )}
            {session?.status === "ACTIVE" && (
              <>
                <button
                  onClick={() => startBreak.mutate()}
                  disabled={startBreak.isPending}
                  className="rounded-md border border-amber px-4 py-2 text-sm font-medium text-amber hover:bg-amber hover:text-white disabled:opacity-60"
                >
                  Start Break
                </button>
                <button
                  onClick={() => endSession.mutate()}
                  disabled={endSession.isPending}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium text-app-text hover:bg-app-bg disabled:opacity-60"
                >
                  End Session
                </button>
              </>
            )}
            {session?.status === "ON_MANUAL_BREAK" && (
              <button
                onClick={() => endBreak.mutate()}
                disabled={endBreak.isPending}
                className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-deep-teal disabled:opacity-60"
              >
                End Break
              </button>
            )}
            {session?.status === "ON_IDLE_BREAK" && (
              <span className="rounded-full bg-amber/10 px-3 py-1.5 text-sm font-medium text-amber">
                Idle break in progress — activity will resume it automatically
              </span>
            )}
          </div>
        </div>
        {mutationError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {mutationError instanceof Error ? mutationError.message : "Something went wrong."}
          </p>
        )}
      </div>

      <h2 className="mb-3 text-lg font-semibold text-navy">My Daily Results</h2>
      {dailyStatsQuery.isLoading && <p className="text-muted-slate">Loading…</p>}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Work Time" value={formatDuration(stats.totalWorkSeconds)} />
          <StatCard label="Break Time" value={formatDuration(stats.totalBreakSeconds)} />
          <StatCard
            label="Break Count"
            value={stats.breakCount}
            tone={stats.totalBreakSeconds > 3600 ? "danger" : "default"}
            hint={stats.totalBreakSeconds > 3600 ? "Over 1 hour" : undefined}
          />
          <StatCard label="Leads Generated" value={stats.leadsGenerated} />
          <StatCard label="Leads Taken (Search)" value={stats.leadsTakenFromSearch} />
          <StatCard label="Leads Contacted" value={stats.leadsContacted} />
          <StatCard label="Leads Completed" value={stats.leadsCompleted} tone="success" />
          <StatCard label="CDR-Verified Calls" value={stats.cdrVerifiedCalls} tone="success" />
          <StatCard label="Orders Created" value={stats.ordersCreated} tone="success" />
        </div>
      )}
    </div>
  );
}
