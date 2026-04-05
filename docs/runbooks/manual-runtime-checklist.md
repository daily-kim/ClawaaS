<!--
Purpose: Step-by-step checklist for manually verifying that a single ClawaaS user can provision and use an isolated runtime.
TODO: Replace placeholders with the exact operator commands and expected outputs once the runtime scripts are wired together.
-->

# Manual Runtime Checklist

## Goal

Verify that one application user can receive a dedicated Linux user, dedicated OpenClaw gateway, dedicated sandbox bootstrap flow, and a `READY` signal without sharing state with any other user.

## Checklist

1. Confirm the host is Ubuntu 24.04 and Docker, OpenClaw, OpenShell, and systemd are available.
2. Run [`ops/runtime/verify_host.sh`](/home/de1030/workspace/ClawaaS/ops/runtime/verify_host.sh) and record any missing prerequisite.
3. Generate or choose a test runtime user identifier and create the Linux user with [`ops/runtime/create_linux_user.sh`](/home/de1030/workspace/ClawaaS/ops/runtime/create_linux_user.sh).
4. Render the per-user OpenClaw configuration with [`ops/runtime/render_openclaw_config.py`](/home/de1030/workspace/ClawaaS/ops/runtime/render_openclaw_config.py).
5. Start the gateway with [`ops/runtime/start_gateway.sh`](/home/de1030/workspace/ClawaaS/ops/runtime/start_gateway.sh).
6. Confirm the per-user gateway process is active under the expected Linux account.
7. Send the bootstrap turn with [`ops/runtime/bootstrap_agent.sh`](/home/de1030/workspace/ClawaaS/ops/runtime/bootstrap_agent.sh).
8. Verify the bootstrap flow results in sandbox creation and a `READY` response.
9. Confirm the user home, `.openclaw` state, workspace path, and gateway port are isolated to the created Linux user.
10. Stop the gateway and clean up any temporary test artifacts.

## Evidence To Capture

- Linux username used for the test
- Derived gateway port
- Config path rendered for the user
- `systemctl` status output for the gateway unit
- Bootstrap response showing `READY`

## Exit Criteria

The runtime is considered manually verified when the user can bootstrap successfully, the gateway runs as the per-user account, and no shared home/workspace/gateway state is observed.
