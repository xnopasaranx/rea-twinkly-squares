#!/bin/bash
# Production build: compile backend/frontend and build the Docker image.
# Does NOT start the container - run "docker compose up -d" afterwards.
set -e

cd "$(dirname "$0")/.."

echo "[build] Installing backend dependencies..."
npm --prefix backend ci

echo "[build] Installing frontend dependencies..."
npm --prefix frontend ci

echo "[build] Compiling backend..."
npm --prefix backend run build

echo "[build] Building frontend..."
npm --prefix frontend run build

echo "[build] Building Docker image..."
docker compose build

echo "[build] Done. Start with: docker compose up -d"
