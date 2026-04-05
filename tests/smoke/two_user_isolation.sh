#!/usr/bin/env bash
set -euo pipefail

# Smoke test: verify two users are fully isolated from each other.
# Must be run as root on a host where install_runtime.sh has completed.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT_REGISTRY="/var/lib/clawaas/port-registry.json"

UUID_A="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
UUID_B="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
USER_A="oc_u_${UUID_A//-/}"
USER_B="oc_u_${UUID_B//-/}"

cleanup() {
  echo "=== Cleanup ==="
  "${PROJECT_ROOT}/ops/runtime/stop_gateway.sh" "${USER_A}" 2>/dev/null || true
  "${PROJECT_ROOT}/ops/runtime/stop_gateway.sh" "${USER_B}" 2>/dev/null || true
  userdel -r "${USER_A}" 2>/dev/null || true
  userdel -r "${USER_B}" 2>/dev/null || true
  # Clean port registry
  if [[ -f "${PORT_REGISTRY}" ]]; then
    jq --arg a "${USER_A}" --arg b "${USER_B}" 'del(.[$a, $b])' "${PORT_REGISTRY}" > "${PORT_REGISTRY}.tmp" \
      && mv "${PORT_REGISTRY}.tmp" "${PORT_REGISTRY}"
  fi
  echo "Cleanup done."
}
trap cleanup EXIT

echo "=== Create two users ==="
"${PROJECT_ROOT}/ops/runtime/create_linux_user.sh" "${UUID_A}"
"${PROJECT_ROOT}/ops/runtime/create_linux_user.sh" "${UUID_B}"

echo ""
echo "=== Render configs ==="
python3 "${PROJECT_ROOT}/ops/runtime/render_openclaw_config.py" \
  "${USER_A}" "/home/${USER_A}/.openclaw/openclaw.json" \
  --port-registry="${PORT_REGISTRY}"
chown -R "${USER_A}:${USER_A}" "/home/${USER_A}/.openclaw"

python3 "${PROJECT_ROOT}/ops/runtime/render_openclaw_config.py" \
  "${USER_B}" "/home/${USER_B}/.openclaw/openclaw.json" \
  --port-registry="${PORT_REGISTRY}"
chown -R "${USER_B}:${USER_B}" "/home/${USER_B}/.openclaw"

echo ""
echo "=== Verify isolation ==="
errors=0

# 1. Different home directories
if [[ "/home/${USER_A}" != "/home/${USER_B}" ]]; then
  echo "[OK] Different home directories"
else
  echo "[FAIL] Same home directory" >&2
  errors=$((errors + 1))
fi

# 2. Different ports (from registry)
PORT_A=$(jq -r --arg user "${USER_A}" '.[$user]' "${PORT_REGISTRY}")
PORT_B=$(jq -r --arg user "${USER_B}" '.[$user]' "${PORT_REGISTRY}")
if [[ "${PORT_A}" != "${PORT_B}" ]]; then
  echo "[OK] Different ports: A=${PORT_A}, B=${PORT_B}"
else
  echo "[FAIL] Same port: ${PORT_A}" >&2
  errors=$((errors + 1))
fi

# 3. Different config files
CONFIG_A=$(cat "/home/${USER_A}/.openclaw/openclaw.json")
CONFIG_B=$(cat "/home/${USER_B}/.openclaw/openclaw.json")
if [[ "${CONFIG_A}" != "${CONFIG_B}" ]]; then
  echo "[OK] Different config contents"
else
  echo "[FAIL] Identical configs" >&2
  errors=$((errors + 1))
fi

# 4. User A cannot read User B's home
if sudo -u "${USER_A}" ls "/home/${USER_B}/" &>/dev/null; then
  echo "[FAIL] User A can read User B's home" >&2
  errors=$((errors + 1))
else
  echo "[OK] User A cannot read User B's home"
fi

# 5. User B cannot read User A's home
if sudo -u "${USER_B}" ls "/home/${USER_A}/" &>/dev/null; then
  echo "[FAIL] User B can read User A's home" >&2
  errors=$((errors + 1))
else
  echo "[OK] User B cannot read User A's home"
fi

echo ""
if [[ "${errors}" -eq 0 ]]; then
  echo "=== Two-user isolation test PASSED ==="
else
  echo "=== ${errors} isolation check(s) FAILED ===" >&2
  exit 1
fi
