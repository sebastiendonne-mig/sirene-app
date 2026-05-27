#!/bin/bash
# Lance vercel dev --listen 3001 et le redémarre automatiquement s'il plante.
# Usage : ./dev-api.sh
# Stopper : Ctrl+C

PORT=3001
LOG=/tmp/vercel-3001.log

trap 'echo "[dev-api] Arrêt demandé." ; kill $CHILD 2>/dev/null ; exit 0' INT TERM

while true; do
  echo "[dev-api] $(date '+%H:%M:%S') — démarrage vercel dev --listen $PORT"
  vercel dev --listen $PORT 2>&1 | tee -a "$LOG" &
  CHILD=$!
  wait $CHILD
  EXIT=$?
  echo "[dev-api] $(date '+%H:%M:%S') — processus terminé (code $EXIT), redémarrage dans 3s…"
  lsof -ti :$PORT | xargs kill -9 2>/dev/null
  sleep 3
done
