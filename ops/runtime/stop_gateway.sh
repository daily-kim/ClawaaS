#!/usr/bin/env bash
set -euo pipefail

# Purpose: Stop a per-user OpenClaw gateway managed by the systemd template unit.
# TODO: Add graceful drain handling and post-stop validation that the port is no longer listening.

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <linux-user>" >&2
  exit 1
fi

linux_user="$1"
echo "Stopping gateway for ${linux_user} using unit openclaw-gateway@${linux_user}.service"
systemctl stop "openclaw-gateway@${linux_user}.service"
