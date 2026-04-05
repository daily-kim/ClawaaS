#!/usr/bin/env bash
set -euo pipefail

# Purpose: Verify that two ClawaaS runtime users cannot share files, homes, or gateway endpoints.
# TODO: Replace placeholder assertions with real ownership, filesystem, and network isolation checks.

user_a_uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
user_b_uuid="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
user_a="oc_u_${user_a_uuid//-/}"
user_b="oc_u_${user_b_uuid//-/}"

echo "[TODO] Create user ${user_a} and user ${user_b}"
echo "[TODO] Start separate gateways for each runtime user"
echo "[TODO] Confirm ${user_a} cannot read /home/${user_b}"
echo "[TODO] Confirm ${user_b} cannot read /home/${user_a}"
echo "[TODO] Confirm the two users resolve to different gateway ports from base 18800 + username-derived offset"

if [[ "${user_a}" == "${user_b}" ]]; then
  echo "Isolation test users must be distinct" >&2
  exit 1
fi

echo "Two-user isolation smoke stub completed."
