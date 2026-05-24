#!/bin/bash
set -euo pipefail

LOG=/var/log/openclaw-watchdog.log
HEALTH_URL=http://172.17.0.1:18789/health
STATE=/run/openclaw-watchdog.failures
MAX_FAILURES=3

if systemctl is-active --quiet openclaw && curl -fsS --max-time 15 "$HEALTH_URL" >/dev/null; then
  rm -f "$STATE"
  exit 0
fi

failures=0
if [[ -f "$STATE" ]]; then
  failures=$(cat "$STATE" 2>/dev/null || echo 0)
fi
failures=$((failures + 1))
echo "$failures" > "$STATE"

if (( failures < MAX_FAILURES )); then
  echo "$(date -Is) gateway health failed ($failures/$MAX_FAILURES); waiting" >> "$LOG"
  exit 0
fi

echo "$(date -Is) gateway health failed ($failures/$MAX_FAILURES); restarting openclaw" >> "$LOG"
rm -f "$STATE"
systemctl restart openclaw
