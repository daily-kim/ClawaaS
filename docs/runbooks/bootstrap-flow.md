<!--
Purpose: Describe the runtime bootstrap turn sequence from agent creation through the READY confirmation.
TODO: Update this flow with concrete request and response payloads once the API and gateway contract is finalized.
-->

# Bootstrap Flow

## Sequence

1. The application creates an `Agent` record for a signed-in user.
2. The backend resolves the mapped Linux runtime user for that app user.
3. The backend ensures per-user config exists and starts the `openclaw-gateway@<linux-user>` systemd unit if needed.
4. The backend sends the first bootstrap message to the user-specific OpenClaw gateway.
5. OpenClaw uses the OpenShell backend in remote mode and creates the sandbox on the next agent turn.
6. The bootstrap script polls for a successful response and checks for the `READY` marker.
7. The backend marks the runtime instance as ready for normal chat turns.

## Notes

- Sandbox creation happens on the first agent turn, not when config is rendered.
- Per-user isolation depends on unique Linux user, unique home, unique config, unique gateway process, and unique sandbox state.
- A bootstrap failure should leave enough logs to distinguish config, process, auth, and sandbox errors.

## Open Questions

- What exact bootstrap prompt should define the workspace and tool expectations?
- Which gateway health endpoint or log signal should be treated as authoritative before the first turn?
- How long should the control plane wait before classifying bootstrap as failed?
