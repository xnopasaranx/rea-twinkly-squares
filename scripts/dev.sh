#!/bin/bash
# Start the backend and frontend dev servers locally.
# The Vite dev server proxies /api and /library to the backend (default http://localhost:3000).
set -e

cd "$(dirname "$0")/.."

export PORT=3000
export TWINKLY_DEFAULT_IP="${TWINKLY_DEFAULT_IP:-192.168.2.50}"
export DATA_DIR="${DATA_DIR:-./data}"
export VITE_API_URL="${VITE_API_URL:-http://localhost:3000}"

echo "[dev] Starting backend dev server on PORT=$PORT..."
npm --prefix backend run dev &
BACKEND_PID=$!

echo "[dev] Starting frontend dev server..."
npm --prefix frontend run dev &
FRONTEND_PID=$!

shutdown() {
  echo "[dev] Shutting down..."
  kill "$FRONTEND_PID" 2>/dev/null || true
  kill "$BACKEND_PID" 2>/dev/null || true
  wait
}
trap shutdown INT TERM EXIT

echo "[dev] Running. Open http://localhost:5173 (backend API on http://localhost:3000)"
wait
