#!/usr/bin/env bash
set -euo pipefail

# Purpose: Create a dedicated Linux user for a ClawaaS app user with isolated home and runtime directories.
# TODO: Add UID/GID policy, workspace directory provisioning, and idempotent validation logic.

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <uuid>" >&2
  exit 1
fi

uuid="$1"

# Validate UUID format to prevent injection via useradd
uuid_regex='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
if [[ ! "${uuid}" =~ ${uuid_regex} ]]; then
  echo "Error: invalid UUID format: ${uuid}" >&2
  exit 1
fi

# Use first 8 hex chars of UUID to stay within Linux 32-char username limit
# oc_u_ (5) + 8 hex = 13 chars, well within limit
short_id="${uuid:0:8}"
linux_user="oc_u_${short_id}"
home_dir="/home/${linux_user}"

echo "Planned Linux user: ${linux_user}"

if id "${linux_user}" >/dev/null 2>&1; then
  echo "User already exists: ${linux_user}"
  exit 0
fi

useradd --create-home --home-dir "${home_dir}" --shell /bin/bash "${linux_user}"
install -d -m 700 -o "${linux_user}" -g "${linux_user}" "${home_dir}/.openclaw"
install -d -m 700 -o "${linux_user}" -g "${linux_user}" "${home_dir}/.openclaw/tmp"
install -d -m 700 -o "${linux_user}" -g "${linux_user}" "${home_dir}/workspace"

# Create /tmp/openclaw-<uid> owned by this user (OpenClaw temp dir requirement)
user_uid="$(id -u "${linux_user}")"
install -d -m 700 -o "${linux_user}" -g "${linux_user}" "/tmp/openclaw-${user_uid}"

echo "Created ${linux_user} with isolated home ${home_dir}"
