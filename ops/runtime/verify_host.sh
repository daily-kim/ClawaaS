#!/usr/bin/env bash
set -euo pipefail

# Purpose: Verify that the runtime host has all required binaries and services for ClawaaS.

errors=0

check_cmd() {
  local cmd="$1"
  if command -v "${cmd}" &>/dev/null; then
    # Use timeout and close stdin to prevent interactive prompts from hanging
    local ver
    ver="$(timeout 5 "${cmd}" --version </dev/null 2>&1 | head -1)" || ver="installed"
    echo "[OK]   ${cmd}: ${ver}"
  else
    echo "[FAIL] ${cmd}: not found"
    errors=$((errors + 1))
  fi
}

check_service() {
  local svc="$1"
  if systemctl is-active --quiet "${svc}" 2>/dev/null; then
    echo "[OK]   service ${svc}: active"
  else
    echo "[FAIL] service ${svc}: not active"
    errors=$((errors + 1))
  fi
}

echo "=== ClawaaS Host Verification ==="
echo ""

echo "--- Required binaries ---"
check_cmd docker
check_cmd openclaw
check_cmd openshell
check_cmd node
check_cmd python3
check_cmd uv
check_cmd systemctl
check_cmd curl
check_cmd jq

echo ""
echo "--- Required services ---"
check_service docker

echo ""
echo "--- Python version ---"
python_ok="$(python3 -c 'import sys; print("ok" if sys.version_info >= (3, 12) else "warn")')"
python_ver="$(python3 --version 2>&1)"
if [[ "${python_ok}" == "ok" ]]; then
  echo "[OK]   ${python_ver} >= 3.12"
else
  echo "[WARN] ${python_ver} — 3.12+ recommended"
fi

echo ""
if [[ "${errors}" -eq 0 ]]; then
  echo "=== All checks passed ==="
  exit 0
else
  echo "=== ${errors} check(s) failed ==="
  exit 1
fi
