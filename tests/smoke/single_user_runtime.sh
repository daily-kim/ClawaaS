#!/usr/bin/env bash
set -euo pipefail

# Smoke test: single-user runtime end-to-end
# Must be run as root on a host where install_runtime.sh has completed.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_UUID="11111111-1111-1111-1111-111111111111"
LINUX_USER="oc_u_${TEST_UUID:0:8}"
AGENT_ID="smoke-test-agent-001"
PORT_REGISTRY="/var/lib/clawaas/port-registry.json"

cleanup() {
  echo "=== Cleanup ==="
  "${PROJECT_ROOT}/ops/runtime/stop_gateway.sh" "${LINUX_USER}" 2>/dev/null || true
  userdel -r "${LINUX_USER}" 2>/dev/null || true
  # Remove user from port registry
  if [[ -f "${PORT_REGISTRY}" ]]; then
    jq --arg user "${LINUX_USER}" 'del(.[$user])' "${PORT_REGISTRY}" > "${PORT_REGISTRY}.tmp" \
      && mv "${PORT_REGISTRY}.tmp" "${PORT_REGISTRY}"
  fi
  # Remove systemd unit
  rm -f /etc/systemd/system/openclaw-gateway@.service
  systemctl daemon-reload 2>/dev/null || true
  echo "Cleanup done."
}
trap cleanup EXIT

echo "=== [1/6] Verify host ==="
"${PROJECT_ROOT}/ops/runtime/verify_host.sh"

echo ""
echo "=== [2/6] Create Linux user ==="
"${PROJECT_ROOT}/ops/runtime/create_linux_user.sh" "${TEST_UUID}"

echo ""
echo "=== [3/6] Render config ==="
python3 "${PROJECT_ROOT}/ops/runtime/render_openclaw_config.py" \
  "${LINUX_USER}" \
  "/home/${LINUX_USER}/.openclaw/openclaw.json" \
  --port-registry="${PORT_REGISTRY}"
chown -R "${LINUX_USER}:${LINUX_USER}" "/home/${LINUX_USER}/.openclaw"

echo ""
echo "=== [4/6] Install systemd unit ==="
cp "${PROJECT_ROOT}/ops/systemd/openclaw-gateway@.service" /etc/systemd/system/
systemctl daemon-reload

echo ""
echo "=== [5/6] Start gateway ==="
"${PROJECT_ROOT}/ops/runtime/start_gateway.sh" "${LINUX_USER}"

echo ""
echo "=== [6/6] Bootstrap agent ==="
PORT_REGISTRY="${PORT_REGISTRY}" "${PROJECT_ROOT}/ops/runtime/bootstrap_agent.sh" "${LINUX_USER}" "${AGENT_ID}"

echo ""
echo "=== Isolation checks ==="
owner=$(stat -c '%U' "/home/${LINUX_USER}")
if [[ "${owner}" == "${LINUX_USER}" ]]; then
  echo "[OK] Home directory owned by ${LINUX_USER}"
else
  echo "[FAIL] Home directory owned by ${owner}, expected ${LINUX_USER}" >&2
  exit 1
fi

perms=$(stat -c '%a' "/home/${LINUX_USER}")
if [[ "${perms}" == "700" ]]; then
  echo "[OK] Home directory permissions: ${perms}"
else
  echo "[WARN] Home directory permissions: ${perms} (expected 700)"
fi

echo ""
echo "=== Single-user smoke test PASSED ==="
