#!/usr/bin/env bash
set -euo pipefail

# Purpose: Clean up all ClawaaS test state (users, gateways, DB, port registry).
# Must be run as root.

echo "=== ClawaaS cleanup ==="

# Stop and remove all oc_u_* users
for user in $(getent passwd | grep '^oc_u_' | cut -d: -f1); do
  echo "Removing ${user}..."
  systemctl stop "openclaw-gateway@${user}.service" 2>/dev/null || true
  userdel -r "${user}" 2>/dev/null || true
done

# Reset port registry
REGISTRY="/var/lib/clawaas/port-registry.json"
if [[ -f "${REGISTRY}" ]]; then
  echo '{}' > "${REGISTRY}"
  echo "Port registry reset."
fi

# Remove API database
API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/apps/api"
rm -f "${API_DIR}/clawaas.db"
echo "API database removed."

echo "=== Cleanup done ==="
