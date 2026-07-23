"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "../lib/api-client";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;
const HEARTBEAT_INTERVAL_MS = 15000;

/**
 * Browser-based activity tracker (CLAUDE.md rule 3, superseding the
 * original Windows-companion design). Resets an idle timer on any
 * interaction targeted at this tab and reports idle duration to the API
 * on a heartbeat. Mounted only for Agents (see AppShell) - it is a real,
 * accepted limitation that this can only see activity within the tab, not
 * the whole device.
 *
 * Renders nothing. Silently does nothing if the API reports tracking is
 * disabled for this Agent (Admin per-Agent toggle) - no UI, no polling
 * overhead beyond the one initial status check.
 */
export function ActivityTracker() {
  const lastActivityRef = useRef<number>(Date.now());
  const enabledRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function markActive() {
      lastActivityRef.current = Date.now();
    }

    async function sendHeartbeat() {
      if (!enabledRef.current) return;
      const idleDurationSeconds = Math.max(Math.floor((Date.now() - lastActivityRef.current) / 1000), 0);
      await apiFetch("/activity/heartbeat", {
        method: "POST",
        body: JSON.stringify({
          lastActivityAt: new Date(lastActivityRef.current).toISOString(),
          idleDurationSeconds,
        }),
      }).catch(() => undefined); // best-effort - a missed heartbeat just means the next one catches up
    }

    apiFetch<{ enabled: boolean; thresholdSeconds: number }>("/activity/status")
      .then((status) => {
        if (cancelled || !status?.enabled) return;
        enabledRef.current = true;
        markActive();
        ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));
        intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
    };
  }, []);

  return null;
}
