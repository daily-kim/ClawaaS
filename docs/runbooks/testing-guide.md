# 테스트 가이드

서버 설정 완료 후 아래 순서대로 검증합니다.

## 환경변수 (LLM 연동 테스트 시 필요)

```bash
export CLAWAAS_LLM_API_URL="https://your-litellm-endpoint"
export CLAWAAS_LLM_MODEL="your-model-name"
export LITELLM_API_KEY="sk-xxx"
```

---

## 1. 호스트 검증

```bash
sudo bash ops/runtime/verify_host.sh
```

기대 결과: 모든 바이너리 `[OK]`, 마지막에 `All checks passed`.

## 2. 두 유저 격리 테스트

```bash
sudo bash tests/smoke/two_user_isolation.sh
```

LLM 연동 없이 실행 가능. 검증 항목:
- 서로 다른 홈 디렉토리
- 서로 다른 포트 할당
- 서로 다른 config 내용
- 상호 홈 디렉토리 접근 불가

기대 결과: `Two-user isolation test PASSED`

## 3. 단일 유저 런타임 E2E 테스트

```bash
sudo CLAWAAS_LLM_API_URL="${CLAWAAS_LLM_API_URL}" \
     CLAWAAS_LLM_MODEL="${CLAWAAS_LLM_MODEL}" \
     LITELLM_API_KEY="${LITELLM_API_KEY}" \
     bash tests/smoke/single_user_runtime.sh
```

실행 순서: verify host → create user → render config → install systemd → start gateway → bootstrap agent.

기대 결과: `Single-user smoke test PASSED`

> LLM 환경변수 없이도 gateway 시작까지는 성공합니다.
> bootstrap에서 READY를 받으려면 LLM 연동이 필요합니다.

## 4. API 전체 플로우 테스트

```bash
cd apps/api
uv sync  # 최초 1회: 파이썬 의존성 설치

# API 서버 시작
CLAWAAS_PROJECT_ROOT="$(cd ../.. && pwd)" \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 &
```

### a. 회원가입

```bash
SIGNUP=$(curl -s http://127.0.0.1:8000/auth/signup -X POST \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@demo.com","password":"pass123"}')
echo "$SIGNUP"
TOKEN=$(echo "$SIGNUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

### b. 에이전트 생성

```bash
AGENT=$(curl -s http://127.0.0.1:8000/agents -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-agent"}')
echo "$AGENT"
AGENT_ID=$(echo "$AGENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
LINUX_USER=$(echo "$AGENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['linux_user'])")
```

이 시점에서 확인:
- `id $LINUX_USER` → uid 확인
- `systemctl is-active openclaw-gateway@${LINUX_USER}.service` → `active`

### c. API key 주입 + gateway 재시작

```bash
sudo bash -c "echo 'LITELLM_API_KEY=${LITELLM_API_KEY}' >> /home/${LINUX_USER}/.openclaw/gateway.env"
sudo systemctl restart openclaw-gateway@${LINUX_USER}.service
```

### d. 부트스트랩

```bash
curl -s http://127.0.0.1:8000/agents/${AGENT_ID}/bootstrap -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"bootstrap_message":"Initialize and reply READY."}'
```

### e. 상태 확인 (ready 될 때까지 반복)

```bash
curl -s http://127.0.0.1:8000/agents/${AGENT_ID} \
  -H "Authorization: Bearer $TOKEN"
```

### f. 채팅

```bash
curl -s http://127.0.0.1:8000/agents/${AGENT_ID}/chat -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hello!"}'
```

기대 결과: `{"response": "...LLM 응답 JSON..."}` (status: ok)

### g. 정리

```bash
# API 서버 종료
kill %1

# 테스트 유저 삭제
sudo systemctl stop openclaw-gateway@${LINUX_USER}.service
sudo userdel -r ${LINUX_USER}
rm -f clawaas.db
```

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| `verify_host.sh`에서 `[FAIL]` | 바이너리 미설치 | `install_runtime.sh` 재실행 |
| gateway `activating` 후 `failed` | LITELLM_API_KEY 누락 | gateway.env에 key 추가 후 restart |
| `network connection error` | Node.js TLS 인증서 | systemd unit에 `NODE_OPTIONS=--use-system-ca` 확인 |
| `OPENCLAW_HOME/.openclaw` 중복 경로 | OPENCLAW_HOME이 `.openclaw`을 포함 | `OPENCLAW_HOME=/home/<user>` (홈 디렉토리 자체) |
| bootstrap READY 안 옴 | LLM API 미설정 | 환경변수 3개 설정 확인 |
| `config.py` project_root 오류 | 레포 경로 다름 | `CLAWAAS_PROJECT_ROOT=/your/path` |
