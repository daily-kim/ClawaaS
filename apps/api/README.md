<!--
Purpose: Describe the FastAPI control plane responsible for authentication, agent lifecycle management, and chat proxying for ClawaaS.
TODO: Replace this skeleton with setup instructions, environment variables, and request/response examples after the first API slice is implemented.
-->

# ClawaaS API

This service is the control plane for:

- user signup, login, logout, and session lookup
- agent creation and listing
- bootstrap orchestration for per-user runtimes
- proxying chat turns to a user's dedicated gateway

## Planned Modules

- `app/main.py`: FastAPI entrypoint and app wiring
- `app/config.py`: environment-driven settings
- `app/db.py`: SQLite connectivity helpers
- `app/models.py`: stub data models for users, sessions, agents, and runtime instances
- `app/routers/`: HTTP endpoints for auth and agent lifecycle

## Development

Install dependencies from `requirements.txt` and run the app with `uvicorn` once the implementation is no longer placeholder-only.
