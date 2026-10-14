#!/bin/sh
# Runs one scheduled check, keeps its output, and shows a macOS notification if it fails.
#   sh tools/run_scheduled_check.sh <name> <command> [args…]
# Logs: ~/Library/Logs/ganjineh/<name>.log (last run) and <name>-history.log (one line per run).
NAME="$1"; shift
LOGDIR="$HOME/Library/Logs/ganjineh"
mkdir -p "$LOGDIR"
cd "$(dirname "$0")/.."
STAMP="$(date '+%Y-%m-%d %H:%M')"
if "$@" > "$LOGDIR/$NAME.log" 2>&1; then
  echo "$STAMP ok" >> "$LOGDIR/$NAME-history.log"
else
  CODE=$?
  echo "$STAMP FAILED (exit $CODE)" >> "$LOGDIR/$NAME-history.log"
  SUMMARY="$(grep -E '✗|under budget|fell' "$LOGDIR/$NAME.log" | head -3 | tr '\n' ' ' | cut -c1-180)"
  osascript -e "display notification \"${SUMMARY:-see ~/Library/Logs/ganjineh/$NAME.log}\" with title \"Ganjineh Ofogh: $NAME failed\"" 2>/dev/null || true
  exit "$CODE"
fi
