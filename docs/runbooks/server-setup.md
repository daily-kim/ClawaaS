# 폐쇄망 서버 초기 설정 가이드

## 전제 조건
- Ubuntu 24.04 (또는 호환 Linux)
- root 또는 sudo 권한
- Docker 설치됨 (또는 설치 가능)
- Node.js 22.14+ 및 npm 설치됨
- 인터넷 접근 가능 (설치 시에만, 이후 폐쇄망 OK)

## 1단계: 시스템 패키지

```bash
sudo apt-get update
sudo apt-get install -y curl jq sudo
```

## 2단계: Docker

```bash
sudo apt-get install -y docker.io
sudo systemctl enable --now docker
```

## 3단계: Node.js (OpenClaw 필수)

```bash
# 시스템 패키지 매니저 또는 NodeSource 등으로 설치
sudo apt-get install -y nodejs npm

# 확인 (22.14+ 필요)
node --version
npm --version
```

## 4단계: uv (Python 패키지 매니저)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh

# 시스템 전역으로 복사 (sudo에서 접근 가능하도록)
sudo cp ~/.local/bin/uv /usr/local/bin/uv
sudo cp ~/.local/bin/uvx /usr/local/bin/uvx
```

## 5단계: OpenClaw CLI

### 방법 A: 레포 내 로컬 패키지 사용 (폐쇄망 권장)

레포의 `ops/packages/` 디렉토리에 npm tarball이 포함되어 있습니다.

```bash
# npm global install
sudo npm install -g ~/workspace/ClawaaS/ops/packages/openclaw-*.tgz

# 시스템 전역 설치 — /opt에 복사 + wrapper 방식
NODE_BIN="$(which node)"
OPENCLAW_PKG="$(npm root -g)/openclaw"

sudo mkdir -p /opt/openclaw
sudo cp -a "${OPENCLAW_PKG}" /opt/openclaw/pkg
sudo cp "${NODE_BIN}" /opt/openclaw/node

sudo tee /usr/local/bin/openclaw > /dev/null << 'WRAPPER'
#!/bin/sh
exec /opt/openclaw/node /opt/openclaw/pkg/openclaw.mjs "$@"
WRAPPER
sudo chmod +x /usr/local/bin/openclaw

# node도 시스템 경로에 (없을 경우)
sudo cp "${NODE_BIN}" /usr/local/bin/node 2>/dev/null || true

# 확인
sudo openclaw --version
```

### 방법 B: 인터넷에서 직접 설치

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
# 이후 /opt/openclaw + wrapper 설정은 방법 A와 동일
```

## 6단계: OpenShell CLI

### 방법 A: 레포 내 로컬 패키지 사용 (폐쇄망 권장)

```bash
sudo tar xzf ~/workspace/ClawaaS/ops/packages/openshell-*.tar.gz -C /usr/local/bin/
sudo chmod +x /usr/local/bin/openshell

# 확인
sudo openshell --version
```

### 방법 B: 인터넷에서 직접 설치

```bash
curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
sudo cp ~/.local/bin/openshell /usr/local/bin/openshell

sudo openshell --version
```

## 7단계: 레포 클론 및 검증

```bash
git clone <repo-url> ~/workspace/ClawaaS
cd ~/workspace/ClawaaS

# 모든 바이너리 확인
sudo bash ops/runtime/verify_host.sh
# 기대 결과: All checks passed
```

## 8단계: systemd unit 설치

```bash
sudo cp ops/systemd/openclaw-gateway@.service /etc/systemd/system/
sudo systemctl daemon-reload
```

## 9단계: sudoers 설정 (선택)

```bash
# FastAPI 서비스 계정이 유저 생성/게이트웨이 관리를 할 수 있도록
sudo cp ops/sudoers/app-provisioner /etc/sudoers.d/app-provisioner
sudo chmod 440 /etc/sudoers.d/app-provisioner
# 주의: app-provisioner 파일의 "appuser"를 실제 서비스 계정으로 수정
```

## 10단계: 테스트

상세 절차는 [testing-guide.md](testing-guide.md) 참조.

```bash
# 빠른 검증
sudo bash ops/runtime/verify_host.sh
sudo bash tests/smoke/two_user_isolation.sh

# LLM 연동 포함 전체 테스트
sudo CLAWAAS_LLM_API_URL="https://your-llm-endpoint" \
     CLAWAAS_LLM_MODEL="your-model-name" \
     CLAWAAS_API_KEY="sk-xxx" \
     bash tests/smoke/single_user_runtime.sh
```

---

## 요약: 전체 명령어 한 번에

```bash
# === 패키지 ===
sudo apt-get update && sudo apt-get install -y curl jq sudo docker.io nodejs npm
sudo systemctl enable --now docker

# === uv ===
curl -LsSf https://astral.sh/uv/install.sh | sh
sudo cp ~/.local/bin/uv ~/.local/bin/uvx /usr/local/bin/

# === OpenClaw (로컬 패키지) ===
sudo npm install -g ~/workspace/ClawaaS/ops/packages/openclaw-*.tgz
NODE_BIN="$(which node)"
OPENCLAW_PKG="$(npm root -g)/openclaw"
sudo mkdir -p /opt/openclaw
sudo cp -a "${OPENCLAW_PKG}" /opt/openclaw/pkg
sudo cp "${NODE_BIN}" /opt/openclaw/node
sudo tee /usr/local/bin/openclaw > /dev/null << 'WRAPPER'
#!/bin/sh
exec /opt/openclaw/node /opt/openclaw/pkg/openclaw.mjs "$@"
WRAPPER
sudo chmod +x /usr/local/bin/openclaw
sudo cp "${NODE_BIN}" /usr/local/bin/node 2>/dev/null || true

# === OpenShell (로컬 패키지) ===
sudo tar xzf ~/workspace/ClawaaS/ops/packages/openshell-*.tar.gz -C /usr/local/bin/
sudo chmod +x /usr/local/bin/openshell

# === 프로젝트 설정 ===
cd ~/workspace/ClawaaS
sudo bash ops/runtime/verify_host.sh
sudo cp ops/systemd/openclaw-gateway@.service /etc/systemd/system/
sudo systemctl daemon-reload

# === 테스트 ===
sudo bash tests/smoke/two_user_isolation.sh
sudo CLAWAAS_LLM_API_URL="https://your-llm-endpoint" \
     CLAWAAS_LLM_MODEL="your-model-name" \
     CLAWAAS_API_KEY="sk-xxx" \
     bash tests/smoke/single_user_runtime.sh
```
