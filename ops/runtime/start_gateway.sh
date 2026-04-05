#!/usr/bin/env bash
set -euo pipefail

# Purpose: Start a per-user OpenClaw gateway through the systemd template unit.
# Verifies config exists and waits for gateway to become healthy.

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <linux-user>" >&2
  exit 1
fi

linux_user="$1"
home_dir="/home/${linux_user}"
config_file="${home_dir}/.openclaw/openclaw.json"
unit="openclaw-gateway@${linux_user}.service"

# Pre-flight: check config exists
if [[ ! -f "${config_file}" ]]; then
  echo "Error: config not found at ${config_file}" >&2
  echo "Run render_openclaw_config.py first." >&2
  exit 1
fi

echo "Starting gateway for ${linux_user} (unit: ${unit})"
systemctl start "${unit}"

# Wait for gateway to become active (up to 15s)
for i in $(seq 1 15); do
  if systemctl is-active --quiet "${unit}"; then
    echo "Gateway for ${linux_user} is active."
    exit 0
  fi
  sleep 1
done

echo "Error: gateway did not become active within 15s" >&2
systemctl status "${unit}" --no-pager >&2
exit 1
