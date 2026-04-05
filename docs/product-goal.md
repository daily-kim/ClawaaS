# Product Goal

## Demo Story
> 사용자가 가입하고 로그인한다.
> New Agent를 누른다.
> 백엔드가 그 유저 전용 OpenClaw/OpenShell 런타임을 연다.
> 사용자는 바로 자기 agent와 대화한다.

## Success Criteria
- A와 B 두 유저가 각각 가입 가능
- 각자 로그인 가능
- 각자 New Agent 가능
- 각 agent는 별도 runtime에서 뜸
- A의 workspace/credentials/state를 B가 볼 수 없음
- 채팅 가능
- 재로그인 후 자기 agent 다시 열 수 있음

## Isolation Model
```
1 app user = 1 Linux user = 1 ~/.openclaw = 1 gateway process = 1 sandbox
```

Each user gets:
- Dedicated Linux account (e.g., oc_u_<uuid>)
- Own ~/.openclaw with config, credentials, sessions
- Own workspace directory
- Own gateway process on a unique port
- Own OpenShell sandbox

## User Flows

### Signup
1. User submits signup form
2. App creates user row in DB
3. Server creates Linux user (oc_u_<uuid>)
4. Prepares home/.openclaw/workspace directories
5. Generates per-user OpenClaw config (OpenShell backend, remote mode, agent scope)

### Login
1. User submits credentials
2. App issues session cookie
3. Starts per-user gateway process if not running
4. Redirects to dashboard

### New Agent
1. App creates agent row (status: PROVISIONING)
2. Sends agent creation request to user's OpenClaw gateway
3. Fires bootstrap turn ("Initialize your workspace and reply READY")
4. OpenClaw creates OpenShell sandbox during this turn
5. UI transitions to READY

### Chat
1. Browser sends message to FastAPI
2. FastAPI proxies to user's gateway
3. Response streamed back to browser

## Architecture
```
[Browser] -> Next.js

[App API] -> FastAPI -> SQLite

[Provisioner]
  -> per-user Linux account/home
  -> per-user OpenClaw gateway process
  -> per-user OpenClaw profile/workspace
  -> per-user OpenShell-backed agent

[Runtime]
  -> OpenClaw + OpenShell + Docker + Internal LLM API
```
