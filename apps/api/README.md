# ClawaaS API

FastAPI 기반 컨트롤 플레인. 인증, 에이전트 수명주기, 채팅 프록시, 파일 접근을 담당합니다.

## 모듈 구조

| 파일 | 역할 |
|------|------|
| `app/main.py` | FastAPI 앱 생성, 라우터 등록, CORS, DB 초기화 |
| `app/config.py` | `CLAWAAS_*` 환경변수 기반 설정 (pydantic-settings) |
| `app/db.py` | SQLite 연결 및 초기 스키마 |
| `app/routers/auth.py` | 회원가입, 로그인, 세션 조회 |
| `app/routers/agents.py` | 에이전트 CRUD, 채팅, 로그 스트리밍, 파일 접근 |
| `app/provisioner.py` | Linux 유저 생성, 설정 렌더링, 게이트웨이 관리, 샌드박스 파일 I/O |

## 실행

```bash
# 의존성 설치
uv sync

# 환경변수 설정
cp .env.example .env
# .env 파일 수정

# 개발 서버
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `CLAWAAS_LLM_API_URL` | LLM API 엔드포인트 URL | (빈 문자열) |
| `CLAWAAS_LLM_MODEL` | 사용할 모델 이름 | (빈 문자열) |
| `CLAWAAS_API_KEY` | LLM API 키 | (빈 문자열) |
| `CLAWAAS_DATABASE_URL` | SQLite 경로 | `sqlite+aiosqlite:///./clawaas.db` |
| `CLAWAAS_JWT_SECRET` | 세션 토큰 서명 키 | `change-me` |

`CLAWAAS_LLM_API_URL`과 `CLAWAAS_LLM_MODEL`이 비어있으면 새 에이전트의 OpenClaw 설정에 models 섹션이 생성되지 않아 LLM 호출이 실패합니다.
