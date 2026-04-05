# Bootstrap Flow

## Sequence

```
[App Backend]                    [systemd]              [OpenClaw Gateway]        [OpenShell]
     |                               |                         |                      |
     |-- POST /agents -------------->|                         |                      |
     |   (create agent row,          |                         |                      |
     |    status=PROVISIONING)       |                         |                      |
     |                               |                         |                      |
     |-- systemctl start ----------->|                         |                      |
     |   openclaw-gateway@user       |--- start cmdok -------->|                      |
     |                               |   (reads openclaw.json) |                      |
     |                               |                         |                      |
     |-- POST /agents/{id}/bootstrap |                         |                      |
     |   (bootstrap message) --------|------------------------>|                      |
     |                               |                         |-- agent turn ------->|
     |                               |                         |   (first turn)       |
     |                               |                         |                      |
     |                               |                         |<- sandbox created ---|
     |                               |                         |   (openshell sandbox |
     |                               |                         |    create + ssh-config)
     |                               |                         |                      |
     |<-- response with READY -------|--------------------------|                      |
     |   (status -> READY)           |                         |                      |
```

## Key Points

1. **Sandbox is created on the first agent turn**, not when config is rendered or gateway starts.
   OpenClaw's OpenShell backend calls `openshell sandbox create` and `openshell sandbox ssh-config` during the first turn.

2. **Remote mode**: after initial creation, the remote workspace becomes canonical.
   The app backend must not modify workspace contents directly — use bootstrap turns only.

3. **State transitions**: `CREATED -> PROVISIONING -> READY -> ERROR`
   - CREATED: agent row exists in DB
   - PROVISIONING: gateway started, bootstrap turn sent
   - READY: bootstrap response received with READY marker
   - ERROR: any failure in the above sequence

## Gateway Health Check

Before sending the bootstrap turn, verify the gateway is reachable:
```bash
curl -sf http://127.0.0.1:<port>/health
```

## Bootstrap Message

Default: `"Initialize your workspace and reply READY when complete."`

The agent should set up its workspace and confirm readiness. The READY marker in the response is what transitions the agent status.

## Failure Modes

| Failure | Symptom | Action |
|---------|---------|--------|
| Config invalid | Gateway won't start | Check `journalctl -u openclaw-gateway@user` |
| Gateway unreachable | Health check timeout | Check systemd status and port |
| Bootstrap timeout | No response in 120s | Check LLM API connectivity |
| No READY in response | Bootstrap returns but no READY | Check LLM prompt / model config |
| Sandbox creation fails | OpenShell error in gateway logs | Check Docker + OpenShell installation |
