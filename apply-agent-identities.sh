#!/usr/bin/env bash
set -euo pipefail

MAP_FILE="${1:-/tmp/agent-identity-map.tsv}"

while IFS=$'\t' read -r agent_id agent_name; do
  [[ -z "${agent_id:-}" || "${agent_id:0:1}" == "#" ]] && continue
  openclaw agents set-identity --agent "$agent_id" --name "$agent_name" --json >/dev/null
  printf 'updated\t%s\t%s\n' "$agent_id" "$agent_name"
done < "$MAP_FILE"
