# ClawaaS — Claw as a Service

## Project goal
Build a demo where each logged-in user gets an isolated OpenClaw + OpenShell runtime.
One app user = one Linux user = one ~/.openclaw = one gateway process = one sandbox.

## Hard constraints
- Never share ~/.openclaw across users
- Never share workspace across users
- Never share gateway process across users
- Never share sandbox across users

## Non-goals for this demo
- billing, admin, observability, usage metering
- org-shared agents
- shared gateway multi-tenancy
- browser automation
- k8s operator
- NemoClaw

## Tech stack
- Frontend: Next.js
- Backend: FastAPI (Python)
- DB: SQLite
- Process management: systemd
- Runtime: OpenClaw + OpenShell + Docker
- Model: internal LLM API

## Delivery order
1. Runtime spike (manual single-user success)
2. Per-user launcher (Linux user + gateway automation)
3. FastAPI control plane (auth + agent lifecycle)
4. Next.js minimum UI (login, dashboard, chat)

## Working rules
- First show a plan and list of touched files before implementing.
- Do not touch web UI until runtime smoke test is green.
- Prefer minimal patches over broad rewrites.
- Every change must add/update docs and a smoke test.
- FastAPI must NOT perform privileged operations directly; delegate to provisioner scripts via limited sudoers.
- Config changes go through template rendering + validation + restart only.
- App backend must not directly modify user workspaces; changes go through bootstrap turns only.

## Key references
- OpenClaw gateway security: one user/trust boundary per gateway
- OpenShell: alpha, single-player mode — do not treat as production multi-tenant
- OpenClaw OpenShell backend: sandbox created on next agent turn, not at config time
- OpenClaw config: strict validation — bad key/type = gateway won't boot
