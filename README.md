# ClawaaS — Claw as a Service

각 유저에게 격리된 OpenClaw + OpenShell 런타임을 제공하는 데모 플랫폼.

```
1 app user = 1 Linux user = 1 ~/.openclaw = 1 gateway process = 1 sandbox
```

## 구조

```
Browser ─── Next.js (:3000) ──/api proxy──▶ FastAPI (:8000) ──▶ SQLite
                                                │
                                          provisioner.py
                                                │
                            ┌───────────────────┼───────────────────┐
                            ▼                   ▼                   ▼
                     Linux user          OpenClaw gateway     OpenShell sandbox
                   (oc_u_<uuid>)        (systemd, per-user)   (Docker/k3s, per-user)
```

| 디렉토리 | 역할 |
|-----------|------|
| `apps/api/` | FastAPI 백엔드 — 인증, 에이전트 수명주기, 채팅 프록시 |
| `apps/web/` | Next.js 프론트엔드 — 로그인, 대시보드, 채팅/로그/파일 탭 |
| `ops/runtime/` | 프로비저닝 셸 스크립트 (유저 생성, 설정 렌더링, 게이트웨이 관리) |
| `ops/systemd/` | per-user 게이트웨이 systemd unit |
| `ops/sudoers/` | FastAPI → 프로비저너 권한 위임 |
| `ops/packages/` | OpenClaw·OpenShell 오프라인 설치 패키지 |
| `docs/` | 설계 문서, ADR, 런북 |
| `tests/smoke/` | 스모크 테스트 스크립트 |

## 빠른 시작

### 사전 준비

서버 초기 설정은 [docs/runbooks/server-setup.md](docs/runbooks/server-setup.md) 참조.

요약:
- Ubuntu 24.04, sudo 권한
- Docker, Node.js 22.14+, Python 3.11+, uv
- OpenClaw CLI, OpenShell CLI (`ops/packages/`에 오프라인 패키지 포함)
- systemd unit 설치 완료 (`ops/systemd/`)

### 1. 환경 변수 설정

```bash
cp apps/api/.env.example apps/api/.env
# .env 파일을 열어 실제 값으로 수정
```

```env
CLAWAAS_LLM_API_URL=https://your-llm-endpoint/v1
CLAWAAS_LLM_MODEL=your-model-name
CLAWAAS_API_KEY=sk-your-api-key
```

### 2. 백엔드 실행

```bash
cd apps/api
uv sync                # 의존성 설치 (.venv 자동 생성)
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. 프론트엔드 실행

```bash
cd apps/web
npm install            # 의존성 설치
npm run dev            # http://localhost:3000
```

### 4. 사용

1. http://localhost:3000 접속
2. 회원가입 → 로그인
3. Dashboard에서 **New Agent** 클릭
4. 에이전트가 bootstrapping → ready 되면 채팅 가능
5. **Logs** 탭: 게이트웨이 실시간 로그
6. **Files** 탭: 샌드박스 워크스페이스 파일 탐색/편집

## 개발

### API 서버

```bash
cd apps/api
.venv/bin/uvicorn app.main:app --reload    # 코드 변경 시 자동 재시작
```

주요 엔드포인트:

| Method | Path | 설명 |
|--------|------|------|
| POST | `/auth/signup` | 회원가입 |
| POST | `/auth/login` | 로그인 (토큰 발급) |
| GET | `/agents` | 내 에이전트 목록 |
| POST | `/agents` | 에이전트 생성 |
| DELETE | `/agents/{id}` | 에이전트 삭제 |
| POST | `/agents/{id}/chat` | 채팅 턴 전송 |
| GET | `/agents/{id}/logs` | 로그 SSE 스트림 |
| GET | `/agents/{id}/files` | 파일 목록 |
| GET | `/agents/{id}/files/read` | 파일 읽기 |
| PUT | `/agents/{id}/files/write` | 파일 쓰기 |

### 프론트엔드

```bash
cd apps/web
npm run dev       # 개발 서버 (HMR)
npm run build     # 프로덕션 빌드
```

`next.config.js`에서 `/api/*` 요청을 `http://127.0.0.1:8000`으로 프록시합니다.

### 스모크 테스트

```bash
sudo bash ops/runtime/verify_host.sh              # 런타임 의존성 확인
sudo bash tests/smoke/two_user_isolation.sh        # 유저 격리 테스트
```

## 알려진 제한사항

[docs/known-limitations.md](docs/known-limitations.md) 참조.

## 라이선스

내부 데모 전용.
