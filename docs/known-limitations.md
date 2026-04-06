# 알려진 제한사항

이 문서는 현재 데모에서 인지하고 있으나 수정하지 않은 이슈를 기록합니다.

## Critical — 프로덕션 전 필수 해결

### Docker 그룹 멤버십에 의한 tenant 격리 우회

**위치:** `ops/runtime/create_linux_user.sh:37`

per-user Linux 계정이 `docker` 그룹에 추가됩니다. Docker 소켓(`/var/run/docker.sock`)은 `root:docker` 소유이므로, docker 그룹 멤버는 호스트 파일시스템 마운트, privileged 컨테이너 실행 등 사실상 root와 동등한 권한을 가집니다.

**현재 상태:** OpenShell이 Docker 데몬 접근을 필요로 하므로 데모에서는 제거할 수 없습니다. 제거하면 샌드박스 생성이 실패합니다.

**프로덕션 해결 방향:**
- rootless Docker 또는 Podman으로 전환
- Docker 소켓 프록시 (e.g., Tecnativa/docker-socket-proxy)를 두어 허용 API만 노출
- 별도 Docker 데몬을 per-user로 실행 (DinD)

## High

### Workspace 경로에 대한 symlink 공격 가능

**위치:** `apps/api/app/routers/agents.py:170, 183, 205`

파일 API의 경로 검증이 `..` 문자열만 체크합니다. 샌드박스 내부에서 agent가 심볼릭 링크를 생성하면 workspace 밖의 파일을 읽거나 쓸 수 있습니다.

**해결 방향:** `realpath` 후 workspace prefix 검증, 또는 `--no-dereference` 옵션 활용.

### 포트 할당 레이스 컨디션

**위치:** `ops/runtime/render_openclaw_config.py:27-47`

동시에 여러 agent를 생성하면 같은 포트가 할당될 수 있습니다. 파일 락(`fcntl.flock`) 또는 atomic write가 필요합니다.

### 프로비저닝 실패 시 리소스 누수

**위치:** `apps/api/app/routers/agents.py:92-110`

`create_linux_user` 성공 후 이후 단계에서 실패하면 Linux 유저, 포트, systemd 서비스가 정리되지 않습니다. rollback 로직이 필요합니다.

### 로그 스트리밍이 API 프록시를 우회

**위치:** `apps/web/src/app/agents/[id]/page.tsx:139`

SSE 로그 스트리밍이 `http://<hostname>:8000`으로 직접 연결됩니다. HTTPS 환경에서 mixed-content 차단 또는 평문 인증 헤더 노출 위험이 있습니다.

## Medium

### 내부 에러 메시지 클라이언트 노출

`provisioner.py`의 `_run_command`가 stderr를 그대로 raise하고, 라우터가 이를 HTTP 응답으로 반환합니다.

### SQLite 동시 쓰기

WAL 모드, busy timeout 미설정. 동시 요청이 많을 경우 `database is locked` 발생 가능.

### localStorage 토큰 저장

XSS 발생 시 세션 토큰 탈취 가능. httpOnly 쿠키 방식이 더 안전합니다.
