#!/usr/bin/env bash
# Purpose: Inject host CA certificates into the OpenShell k3s container so that
#          container-internal image pulls work behind corporate TLS proxies.
# Usage:   sudo bash inject_container_certs.sh <linux_user>
#
# Copies all .crt files from /usr/local/share/ca-certificates/ on the host
# into the container and configures containerd's certs.d to trust them.
# Uses hot-reloadable certs.d mechanism — no container restart needed.
set -euo pipefail

linux_user="${1:?Usage: inject_container_certs.sh <linux_user>}"
CONTAINER="openshell-cluster-openshell"
HOST_CA_DIR="/usr/local/share/ca-certificates"
CERTS_D="/var/lib/rancher/k3s/agent/etc/containerd/certs.d"
MAX_WAIT=180  # seconds

# ── 1. Start openshell gateway (pulls image on first run) ──
echo "[1/4] Ensuring openshell gateway is running..."
sudo -u "${linux_user}" env HOME="/home/${linux_user}" openshell gateway start 2>&1 || true

# ── 2. Wait for the container to be running ──
echo "[2/4] Waiting for container ${CONTAINER}..."
elapsed=0
while ! docker inspect -f '{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -q true; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [[ ${elapsed} -ge ${MAX_WAIT} ]]; then
    echo "Error: container ${CONTAINER} did not start within ${MAX_WAIT}s" >&2
    exit 1
  fi
done
echo "  Container is running (waited ${elapsed}s)"

# ── 3. Check if there are extra CA certs to inject ──
shopt -s nullglob
certs=( "${HOST_CA_DIR}"/*.crt )
shopt -u nullglob
if [[ ${#certs[@]} -eq 0 ]]; then
  echo "[3/4] No extra CA certs found in ${HOST_CA_DIR}, skipping."
  exit 0
fi

# ── 4. Copy certs and configure containerd certs.d ──
echo "[3/4] Injecting ${#certs[@]} CA cert(s) into container..."
CONTAINER_CA_DIR="/usr/local/share/ca-certificates"
for cert in "${certs[@]}"; do
  name=$(basename "${cert}")
  docker cp "${cert}" "${CONTAINER}:${CONTAINER_CA_DIR}/${name}"
done

# Build the ca array for hosts.toml
ca_array=""
for cert in "${certs[@]}"; do
  name=$(basename "${cert}")
  if [[ -n "${ca_array}" ]]; then
    ca_array="${ca_array}, "
  fi
  ca_array="${ca_array}\"${CONTAINER_CA_DIR}/${name}\""
done

# Configure containerd's certs.d for common registries (hot-reloadable, no restart needed)
echo "[4/4] Configuring containerd certs.d for proxy CA trust..."
registries=("ghcr.io" "docker.io" "registry-1.docker.io")
for registry in "${registries[@]}"; do
  docker exec "${CONTAINER}" mkdir -p "${CERTS_D}/${registry}"

  if [[ "${registry}" == "docker.io" || "${registry}" == "registry-1.docker.io" ]]; then
    server="https://registry-1.docker.io"
  else
    server="https://${registry}"
  fi

  docker exec "${CONTAINER}" bash -c "cat > ${CERTS_D}/${registry}/hosts.toml << EOF
server = \"${server}\"

[host.\"${server}\"]
  ca = [${ca_array}]
EOF"
done

# Also update the system CA bundle for non-containerd TLS (e.g. helm, curl inside container)
docker exec "${CONTAINER}" update-ca-certificates 2>&1 | grep -E "added|removed" || true

# ── Wait for k3s pods to be ready ──
echo "Waiting for k3s pods to be ready..."
elapsed=0
while true; do
  not_ready=$(docker exec "${CONTAINER}" kubectl get pods -A --no-headers 2>/dev/null \
    | grep -v "Completed" \
    | grep -v "Running" \
    | wc -l) || not_ready=99
  if [[ "${not_ready}" -eq 0 ]]; then
    echo "  All pods ready!"
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
  if [[ ${elapsed} -ge ${MAX_WAIT} ]]; then
    echo "  Warning: pods not all ready after ${MAX_WAIT}s, proceeding anyway"
    docker exec "${CONTAINER}" kubectl get pods -A --no-headers 2>/dev/null || true
    break
  fi
  echo "  ${not_ready} pod(s) not ready (${elapsed}s)..."
done

echo "=== CA injection complete ==="
