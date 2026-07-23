#!/usr/bin/env bash
# Render free-tier only allows one web service in this deployment topology
# (no separate free background-worker service), so the BullMQ worker runs
# embedded alongside the API in the same container - the worker in the
# background, the API in the foreground so it owns the process Render's
# health check and $PORT binding expect.
#
# This is an accepted demo-tier trade-off, not a production pattern: if the
# worker crashes, nothing restarts it until the whole service redeploys.
# Fine for a free public demo; do not carry this into a real pilot without
# giving the worker its own always-on service.
set -euo pipefail

echo "[render-start] launching worker in background..."
node apps/worker/dist/main.js &
WORKER_PID=$!

cleanup() {
  echo "[render-start] shutting down worker (pid $WORKER_PID)..."
  kill "$WORKER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[render-start] launching api in foreground..."
node apps/api/dist/main.js
