#!/usr/bin/env bash
set -euo pipefail

# Purpose: Stop a per-user OpenClaw gateway and verify it is no longer running.

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <linux-user>" >&2
  exit 1
fi

linux_user="$1"
unit="openclaw-gateway@${linux_user}.service"

echo "Stopping gateway for ${linux_user} (unit: ${unit})"
systemctl stop "${unit}"

if systemctl is-active --quiet "${unit}" 2>/dev/null; then
  echo "Warning: gateway still active after stop" >&2
  exit 1
fi

echo "Gateway for ${linux_user} stopped."
