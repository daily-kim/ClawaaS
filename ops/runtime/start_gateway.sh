#!/usr/bin/env bash
set -euo pipefail

# Purpose: Start a per-user OpenClaw gateway through the systemd template unit.
# TODO: Check rendered config presence and wait for a healthy gateway socket before returning success.

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <linux-user>" >&2
  exit 1
fi

linux_user="$1"
# Port allocation is documented as base port 18800 plus a stable username-derived offset.
echo "Starting gateway for ${linux_user} using unit openclaw-gateway@${linux_user}.service"
systemctl start "openclaw-gateway@${linux_user}.service"
