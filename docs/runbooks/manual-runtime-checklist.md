# Manual Runtime Checklist

## Goal

Verify that one user can get a dedicated Linux user, OpenClaw gateway, OpenShell sandbox, and a READY signal — all isolated.

## Prerequisites

Run `ops/runtime/install_runtime.sh` as root, then `ops/runtime/verify_host.sh` to confirm:
- `docker`, `cmdok`, `openshell`, `python3`, `uv`, `systemctl`, `curl`, `jq` all available
- Docker service running

## Step-by-step

```bash
# 0. Set test UUID
export TEST_UUID="11111111-1111-1111-1111-111111111111"

# 1. Create Linux user
sudo ops/runtime/create_linux_user.sh "$TEST_UUID"
# Expected: creates oc_u_11111111111111111111111111111111

export LINUX_USER="oc_u_11111111111111111111111111111111"

# 2. Render per-user OpenClaw config
python3 ops/runtime/render_openclaw_config.py "$LINUX_USER" \
  "/home/$LINUX_USER/.openclaw/openclaw.json" \
  --llm-api-url=http://YOUR_LLM_API:PORT/v1
# Expected: config written to /home/<user>/.openclaw/openclaw.json

# 3. Fix ownership (config was written as current user)
sudo chown -R "$LINUX_USER:$LINUX_USER" "/home/$LINUX_USER/.openclaw"

# 4. Install systemd unit (one-time)
sudo cp ops/systemd/openclaw-gateway@.service /etc/systemd/system/
sudo systemctl daemon-reload

# 5. Start gateway
sudo ops/runtime/start_gateway.sh "$LINUX_USER"
# Expected: "Gateway for oc_u_... is active."

# 6. Verify gateway process runs as correct user
ps aux | grep cmdok | grep "$LINUX_USER"
systemctl status "openclaw-gateway@${LINUX_USER}.service"

# 7. Bootstrap agent
ops/runtime/bootstrap_agent.sh "$LINUX_USER" "test-agent-001"
# Expected: "READY — bootstrap successful."

# 8. Verify isolation
ls -la "/home/$LINUX_USER/"
ls -la "/home/$LINUX_USER/.openclaw/"
ls -la "/home/$LINUX_USER/workspace/"
# All should be owned by $LINUX_USER with 700 permissions

# 9. Cleanup
sudo ops/runtime/stop_gateway.sh "$LINUX_USER"
sudo userdel -r "$LINUX_USER"
```

## Evidence To Capture

- [ ] Linux username created
- [ ] Derived gateway port (check with `jq --arg u "$LINUX_USER" '.[$u]' /var/lib/clawaas/port-registry.json`)
- [ ] Config path rendered
- [ ] `systemctl status` output showing User= matches linux user
- [ ] Bootstrap response containing READY
- [ ] Home directory permissions = 700, owned by linux user

## Exit Criteria

The runtime is verified when:
1. Bootstrap returns READY
2. Gateway runs as the per-user Linux account
3. No shared home/workspace/gateway state exists
