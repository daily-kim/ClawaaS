# ADR-0001: Per-user Isolation via Linux Accounts

## Status
Accepted

## Context
OpenClaw does not treat a shared gateway as a hostile multi-tenant boundary.
- ~/.openclaw stores config, credentials, and sessions per installation
- Workspace is treated as private memory
- OpenShell is alpha, single-player mode

We need to provide multiple users with isolated OpenClaw environments on a single host.

## Decision
Map each application user to a dedicated Linux user account.
Username format: `oc_u_<first-8-hex-of-uuid>` (13 chars, within Linux 32-char limit).

```
1 app user -> 1 Linux user -> 1 ~/.openclaw -> 1 workspace -> 1 gateway process -> 1 sandbox
```

Isolation is enforced at the OS level:
- File permissions (700 on home directories)
- Separate gateway processes running as the respective Linux user
- Unique ports per gateway
- systemd template units (openclaw-gateway@<user>.service)

## Consequences

### Positive
- Simple, well-understood isolation model (Unix permissions)
- No custom sandboxing code needed
- Aligns with OpenClaw's one-user-per-gateway recommendation
- Easy to explain and audit

### Negative
- Linux user creation requires root/sudo privileges
- Per-user gateway processes consume more memory than shared gateway
- User count limited by host resources
- Not suitable for large-scale production (acceptable for demo)

### Mitigations
- FastAPI does not run as root; privileged ops delegated to provisioner scripts via restricted sudoers
- Demo targets ~10-20 concurrent users, well within single-host capacity
