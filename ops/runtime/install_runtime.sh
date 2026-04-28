#!/usr/bin/env bash
set -euo pipefail

# Purpose: Install OpenClaw, OpenShell, Docker, uv, and host prerequisites on Ubuntu 24.04.
# Run as root.

if [[ "${EUID}" -ne 0 ]]; then
  echo "This installer must run as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [1/5] System packages ==="
apt-get update -qq
apt-get install -y -qq curl jq sudo

echo "=== [2/5] Docker ==="
if command -v docker &>/dev/null; then
  echo "Docker already installed: $(docker --version)"
else
  apt-get install -y -qq docker.io
  systemctl enable --now docker
fi

echo "=== [3/5] uv + Python ==="
# Install uv to /usr/local/bin so it's available to all users including sudo
if ! command -v uv &>/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | env INSTALLER_NO_MODIFY_PATH=1 sh -s -- --no-modify-path
  # Move from default ~/.local/bin to system path
  if [[ -f /root/.local/bin/uv ]]; then
    mv /root/.local/bin/uv /usr/local/bin/uv
    mv /root/.local/bin/uvx /usr/local/bin/uvx 2>/dev/null || true
  fi
fi
echo "uv: $(uv --version)"
echo "Python: $(python3 --version)"

PACKAGES_DIR="$(cd "${SCRIPT_DIR}/../packages" 2>/dev/null && pwd)" || PACKAGES_DIR=""

echo "=== [4/5] OpenClaw Gateway CLI ==="
if command -v openclaw &>/dev/null; then
  echo "openclaw already installed: $(timeout 5 openclaw --version </dev/null 2>&1 | head -1 || echo 'installed')"
else
  # Requires Node.js 22.14+ or 24+
  if ! command -v node &>/dev/null; then
    echo "Error: Node.js is required for OpenClaw. Install Node.js 22.14+ first." >&2
    exit 1
  fi

  # Try local package first (offline/air-gapped), then fallback to internet
  OPENCLAW_TGZ=$(ls "${PACKAGES_DIR}"/openclaw-*.tgz 2>/dev/null | head -1 || true)
  if [[ -n "${OPENCLAW_TGZ}" ]]; then
    echo "Installing OpenClaw from local package: ${OPENCLAW_TGZ}"
    npm install -g "${OPENCLAW_TGZ}"
  else
    echo "No local package found, installing from internet..."
    curl -fsSL https://openclaw.ai/install.sh | bash
    # Move to system path if installed to user-local
    if [[ -f /root/.local/bin/openclaw ]] && [[ ! -f /usr/local/bin/openclaw ]]; then
      mv /root/.local/bin/openclaw /usr/local/bin/openclaw
    fi
  fi

  # Set up /opt/openclaw for multi-user access
  NODE_BIN="$(which node)"
  OPENCLAW_PKG="$(npm root -g)/openclaw"
  if [[ -d "${OPENCLAW_PKG}" ]]; then
    mkdir -p /opt/openclaw
    cp -a "${OPENCLAW_PKG}" /opt/openclaw/pkg
    cp "${NODE_BIN}" /opt/openclaw/node

    tee /usr/local/bin/openclaw > /dev/null << 'WRAPPER'
#!/bin/sh
exec /opt/openclaw/node /opt/openclaw/pkg/openclaw.mjs "$@"
WRAPPER
    chmod +x /usr/local/bin/openclaw
  fi

  # Ensure node is in system path
  if [[ ! -f /usr/local/bin/node ]]; then
    cp "${NODE_BIN}" /usr/local/bin/node
  fi
fi

echo "=== [5/5] OpenShell CLI ==="
if command -v openshell &>/dev/null; then
  echo "openshell already installed: $(openshell --version 2>&1 || echo 'installed')"
else
  # Try local tarball first (offline/air-gapped), then fallback to internet
  OPENSHELL_TGZ=$(ls "${PACKAGES_DIR}"/openshell-*.tar.gz 2>/dev/null | head -1 || true)
  if [[ -n "${OPENSHELL_TGZ}" ]]; then
    echo "Installing OpenShell from local package: ${OPENSHELL_TGZ}"
    tar xzf "${OPENSHELL_TGZ}" -C /usr/local/bin/
    chmod +x /usr/local/bin/openshell
  else
    echo "No local package found, installing from internet..."
    OPENSHELL_INSTALL_DIR=/usr/local/bin curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
  fi
fi

echo "=== [6/6] Sudoers configuration ==="
SUDOERS_TMP=$(mktemp)
cp "${SCRIPT_DIR}/../sudoers/app-provisioner" "${SUDOERS_TMP}"
sed -i "s/__APPUSER__/$SUDO_USER/g; s|__PROJECT__|$(cd "${SCRIPT_DIR}/../.." && pwd)|g" \
  "${SUDOERS_TMP}"
if visudo -c -f "${SUDOERS_TMP}" >/dev/null 2>&1; then
  mv "${SUDOERS_TMP}" /etc/sudoers.d/clawaas-app-provisioner
  chmod 440 /etc/sudoers.d/clawaas-app-provisioner
  echo "Sudoers policy installed and validated."
else
  echo "ERROR: sudoers syntax check failed — not installing." >&2
  visudo -c -f "${SUDOERS_TMP}"
  rm -f "${SUDOERS_TMP}"
  exit 1
fi

echo ""
echo "=== Installation complete. Run verify_host.sh to confirm. ==="
