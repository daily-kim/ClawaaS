#!/usr/bin/env bash
set -euo pipefail

# Purpose: Send the bootstrap turn to a user's gateway and capture the initial onboarding reply.
# Uses `openclaw agent` CLI which communicates via WebSocket to the gateway.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <linux-user> [bootstrap-message]" >&2
  exit 1
fi

linux_user="$1"
bootstrap_message="${2:-작업 공간 초기화를 마친 뒤, 다른 질문이나 설명 없이 아래 한국어 문구만 그대로 답하세요.

안녕하세요. 저는 이 에이전트입니다.

런타임과 작업 공간 준비를 마쳤고, 지금부터 바로 함께 작업할 수 있습니다.

원하시면 코드 수정, 파일 탐색, 로그 확인, 문제 분석처럼 구체적인 요청부터 시작해도 좋고,

아직 방향을 정하는 중이라면 목표나 상황을 설명해 주셔도 됩니다.

무엇을 먼저 진행할지 알려주세요.}"

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
      OPENCLAW_HOME="/home/${linux_user}" \
      TMPDIR="/home/${linux_user}/.openclaw/tmp" \
  openclaw agent \
    --session-id "bootstrap-${linux_user//_/-}" \
    --message "${bootstrap_message}" \
    --json \
    --timeout 120 \
  2>&1) || {
    echo "Error: bootstrap agent turn failed" >&2
    echo "Output: ${response}" >&2
    exit 1
  }

echo "Response: ${response}"

echo "Bootstrap response captured."
exit 0
