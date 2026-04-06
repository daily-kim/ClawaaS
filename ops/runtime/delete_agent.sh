#!/usr/bin/env bash
# Purpose: Tear down all resources for a single ClawaaS agent user.
# Usage:   sudo bash delete_agent.sh <linux_user>
# Idempotent — safe to run even if resources are already removed.
set -euo pipefail

linux_user="${1:?Usage: delete_agent.sh <linux_user>}"

# Validate username pattern
if [[ ! "${linux_user}" =~ ^oc_u_[0-9a-f]{8}$ ]]; then
  echo "Error: invalid linux user '${linux_user}'" >&2
  exit 1
fi

echo "=== Deleting agent ${linux_user} ==="

# 1. Stop gateway
echo "[1] Stopping gateway..."
systemctl stop "openclaw-gateway@${linux_user}.service" 2>/dev/null || true
sleep 1

# 2. Kill any remaining processes owned by the user
user_uid=$(id -u "${linux_user}" 2>/dev/null) || user_uid=""
if [[ -n "${user_uid}" ]]; then
  pkill -9 -u "${user_uid}" 2>/dev/null || true
  sleep 1
fi

# 3. Remove Linux user + home directory
echo "[2] Removing Linux user..."
userdel -r "${linux_user}" 2>/dev/null || true

# 4. Clean up tmp
if [[ -n "${user_uid}" ]]; then
  rm -rf "/tmp/openclaw-${user_uid}" 2>/dev/null || true
fi

# 5. Remove from port registry
REGISTRY="/var/lib/clawaas/port-registry.json"
if [[ -f "${REGISTRY}" ]]; then
  echo "[3] Cleaning port registry..."
  python3 -c "
import json, sys
reg = json.load(open('${REGISTRY}'))
reg.pop('${linux_user}', None)
json.dump(reg, open('${REGISTRY}', 'w'), indent=2)
print('  Port registry updated')
" 2>/dev/null || echo "  Warning: could not update port registry"
fi

echo "=== Done ==="
