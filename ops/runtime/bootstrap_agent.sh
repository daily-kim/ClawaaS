#!/usr/bin/env bash
set -euo pipefail

# Purpose: Send the bootstrap turn to a user's gateway and verify READY response.

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <linux-user> <agent-id> [bootstrap-message]" >&2
  exit 1
fi

linux_user="$1"
agent_id="$2"
bootstrap_message="${3:-Initialize your workspace and reply READY when complete.}"

# Derive port from the port registry (consistent with render_openclaw_config.py)
PORT_REGISTRY="${PORT_REGISTRY:-/var/lib/clawaas/port-registry.json}"
if [[ -f "${PORT_REGISTRY}" ]]; then
  port=$(jq -r --arg user "${linux_user}" '.[$user] // empty' "${PORT_REGISTRY}")
  if [[ -z "${port}" ]]; then
    echo "Error: no port registered for ${linux_user}" >&2
    exit 1
  fi
else
  echo "Error: port registry not found at ${PORT_REGISTRY}" >&2
  exit 1
fi

gateway_url="http://127.0.0.1:${port}"

echo "Bootstrapping agent ${agent_id} on ${linux_user} via ${gateway_url}"

# Wait for gateway to be reachable (up to 30s)
echo "Waiting for gateway to be reachable..."
for i in $(seq 1 30); do
  if curl -sf "${gateway_url}/health" &>/dev/null; then
    echo "Gateway reachable."
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "Error: gateway not reachable at ${gateway_url} after 30s" >&2
    exit 1
  fi
  sleep 1
done

# Build JSON payload safely with jq
payload=$(jq -n --arg msg "${bootstrap_message}" '{"message": $msg}')

# Send bootstrap turn
echo "Sending bootstrap message..."
response=$(curl -sf -X POST "${gateway_url}/agents/${agent_id}/chat" \
  -H "Content-Type: application/json" \
  -d "${payload}" \
  --max-time 120) || {
    echo "Error: bootstrap request failed" >&2
    exit 1
  }

echo "Response: ${response}"

# Check for READY in response
if echo "${response}" | grep -qi "READY"; then
  echo "READY — bootstrap successful."
  exit 0
else
  echo "Error: READY not found in bootstrap response" >&2
  exit 1
fi
