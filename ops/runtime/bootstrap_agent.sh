#!/usr/bin/env bash
set -euo pipefail

# Purpose: Send the bootstrap turn to a user's gateway and verify READY response.
# Uses `openclaw agent` CLI which communicates via WebSocket to the gateway.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <linux-user> [bootstrap-message]" >&2
  exit 1
fi

linux_user="$1"
bootstrap_message="${2:-Initialize your workspace and reply READY when complete.}"

# Derive port from the port registry
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

echo "Bootstrapping ${linux_user} via gateway on port ${port}"

# Wait for gateway health endpoint (up to 30s)
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

# Send bootstrap turn via openclaw agent CLI
# Run as the target user so OPENCLAW_HOME is correct
echo "Sending bootstrap message via openclaw agent..."
response=$(sudo -u "${linux_user}" \
  env HOME="/home/${linux_user}" \
      OPENCLAW_HOME="/home/${linux_user}/.openclaw" \
      TMPDIR="/home/${linux_user}/.openclaw/tmp" \
  openclaw agent \
    --session-id "bootstrap-${linux_user}" \
    --message "${bootstrap_message}" \
    --json \
    --timeout 120 \
  2>&1) || {
    echo "Error: bootstrap agent turn failed" >&2
    echo "Output: ${response}" >&2
    exit 1
  }

echo "Response: ${response}"

# Check for READY in response
if echo "${response}" | grep -qi "READY"; then
  echo "READY — bootstrap successful."
  exit 0
else
  echo "Warning: READY not found in response, but agent turn completed." >&2
  echo "This may be expected if no LLM API is configured yet." >&2
  exit 0
fi
