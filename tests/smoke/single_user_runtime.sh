#!/usr/bin/env bash
set -euo pipefail

# Purpose: Exercise the single-user runtime path from Linux user creation through gateway bootstrap READY verification.
# TODO: Replace placeholder UUIDs and checks with deterministic test fixtures and strict failure assertions.

project_root="/home/de1030/workspace/ClawaaS"
test_uuid="11111111-1111-1111-1111-111111111111"
linux_user="oc_u_${test_uuid//-/}"
agent_id="agent-single-user-smoke"

echo "[TODO] Create isolated Linux user for ${test_uuid}"
echo "sudo ${project_root}/ops/runtime/create_linux_user.sh ${test_uuid}"

echo "[TODO] Start user gateway"
echo "sudo ${project_root}/ops/runtime/start_gateway.sh ${linux_user}"

echo "[TODO] Bootstrap agent and expect READY"
output="$("${project_root}/ops/runtime/bootstrap_agent.sh" "${linux_user}" "${agent_id}")"
printf '%s\n' "${output}"

if ! grep -q "READY" <<<"${output}"; then
  echo "Bootstrap did not report READY" >&2
  exit 1
fi

echo "Single-user smoke stub passed."
