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

echo "=== [4/5] OpenClaw CLI (cmdok) ==="
if command -v cmdok &>/dev/null; then
  echo "cmdok already installed: $(cmdok --version 2>&1 || echo 'installed')"
else
  curl -fsSL cmdop.com/install-cli.sh | bash -s -- --prefix=/usr/local/bin
fi

echo "=== [5/5] OpenShell CLI ==="
if command -v openshell &>/dev/null; then
  echo "openshell already installed: $(openshell --version 2>&1 || echo 'installed')"
else
  OPENSHELL_INSTALL_DIR=/usr/local/bin curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
fi

echo ""
echo "=== Installation complete. Run verify_host.sh to confirm. ==="
