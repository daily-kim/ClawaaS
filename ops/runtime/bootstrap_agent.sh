#!/usr/bin/env bash
set -euo pipefail

# Purpose: Send the bootstrap turn to a user's gateway and verify that the runtime reports READY.
# TODO: Replace the placeholder curl flow with the real gateway endpoint, payload, and READY contract.

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <linux-user> <agent-id> [bootstrap-message]" >&2
  exit 1
fi

linux_user="$1"
agent_id="$2"
bootstrap_message="${3:-Bootstrap the isolated ClawaaS runtime and reply READY when complete.}"

# Port allocation rule: base port 18800 + stable offset derived from the Linux username.
offset=0
for (( index=0; index<${#linux_user}; index++ )); do
  char="${linux_user:index:1}"
  printf -v ascii_value '%d' "'${char}"
  offset=$((offset + ascii_value))
done
port=$((18800 + (offset % 1000)))

echo "Bootstrapping agent ${agent_id} on ${linux_user} via port ${port}"
echo "[TODO] POST bootstrap message to http://127.0.0.1:${port}/agents/${agent_id}/bootstrap"
echo "[TODO] Parse gateway response and check for READY — this stub does NOT verify real gateway output"
