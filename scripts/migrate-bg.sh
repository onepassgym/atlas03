#!/usr/bin/env bash
# migrate-bg.sh
# Runs the addOpgIds migration as a detached background process.
# Logs go to logs/migrate-opgid-<timestamp>.log
# PID is written to logs/migrate-opgid.pid so you can track/kill it.
#
# Usage:
#   npm run migrate:opgid:bg           # dev MongoDB
#   npm run migrate:opgid:prod:bg      # prod MongoDB (NODE_ENV=production)

set -euo pipefail

ENV="${NODE_ENV:-development}"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
LOG_DIR="$(dirname "$0")/../logs"
LOG_FILE="$LOG_DIR/migrate-opgid-${TIMESTAMP}.log"
PID_FILE="$LOG_DIR/migrate-opgid.pid"

mkdir -p "$LOG_DIR"

# Kill any stale previous run
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "⚠️  A migration is already running (PID $OLD_PID). Aborting."
    echo "   Kill it first:  kill $OLD_PID"
    exit 1
  else
    rm -f "$PID_FILE"
  fi
fi

echo "🚀  Starting opgId migration in background..."
echo "    ENV        : $ENV"
echo "    Log file   : $LOG_FILE"
echo "    PID file   : $PID_FILE"
echo ""

NODE_ENV="$ENV" nohup node migration/index.js --run=addOpgIds \
  >> "$LOG_FILE" 2>&1 &

echo $! > "$PID_FILE"

echo "✅  Migration running — PID $(cat "$PID_FILE")"
echo ""
echo "   Tail logs  :  tail -f $LOG_FILE"
echo "   Stop it    :  kill \$(cat $PID_FILE)"
echo "   Check done :  cat $LOG_FILE | grep -E 'Total:|Nothing to do'"
