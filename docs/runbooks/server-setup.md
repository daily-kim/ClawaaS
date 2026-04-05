# 폐쇄망 서버 초기 설정 가이드

## 전제 조건
- Ubuntu 24.04 (또는 호환 Linux)
- root 또는 sudo 권한
- Docker 설치됨 (또는 설치 가능)
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
# nvm 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc

# Node.js 24 설치
nvm install 24
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
# npm global install (Node.js 필요)
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

# node도 시스템 경로에
sudo cp "${NODE_BIN}" /usr/local/bin/node

# 확인
sudo openclaw --version
```

### 방법 B: 인터넷에서 직접 설치

```bash
curl -fsSL https://openclaw.ai/install.sh | bash

NVM_NODE_DIR="$HOME/.nvm/versions/node/$(node --version)"
sudo mkdir -p /opt/openclaw
sudo cp -a "${NVM_NODE_DIR}/lib/node_modules/openclaw" /opt/openclaw/pkg
sudo cp "${NVM_NODE_DIR}/bin/node" /opt/openclaw/node

sudo tee /usr/local/bin/openclaw > /dev/null << 'WRAPPER'
#!/bin/sh
exec /opt/openclaw/node /opt/openclaw/pkg/openclaw.mjs "$@"
WRAPPER
sudo chmod +x /usr/local/bin/openclaw
sudo cp "${NVM_NODE_DIR}/bin/node" /usr/local/bin/node

sudo openclaw --version
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

## 10단계: 수동 테스트

```bash
# 단일 유저 smoke test
sudo bash tests/smoke/single_user_runtime.sh

# 두 유저 격리 테스트
sudo bash tests/smoke/two_user_isolation.sh
```

## 11단계: LLM API 설정 (bootstrap READY를 받으려면)

OpenClaw는 기본으로 Anthropic API를 호출합니다. 내부 LLM API를 사용하려면
per-user 설정이 필요합니다:

```bash
# 방법 1: openclaw configure로 interactive 설정
sudo -u <linux-user> env HOME=/home/<linux-user> \
  OPENCLAW_HOME=/home/<linux-user>/.openclaw \
  openclaw configure

# 방법 2: auth-profiles.json 직접 생성
# (정확한 형식은 openclaw 문서 참조)
```

---

## 요약: 전체 명령어 한 번에

```bash
# === 패키지 ===
sudo apt-get update && sudo apt-get install -y curl jq sudo docker.io
sudo systemctl enable --now docker

# === Node.js ===
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc && nvm install 24

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
sudo cp "${NODE_BIN}" /usr/local/bin/node

# === OpenShell (로컬 패키지) ===
sudo tar xzf ~/workspace/ClawaaS/ops/packages/openshell-*.tar.gz -C /usr/local/bin/
sudo chmod +x /usr/local/bin/openshell

# === 프로젝트 설정 ===
cd ~/workspace/ClawaaS
sudo bash ops/runtime/verify_host.sh
sudo cp ops/systemd/openclaw-gateway@.service /etc/systemd/system/
sudo systemctl daemon-reload

# === 테스트 ===
sudo bash tests/smoke/single_user_runtime.sh
```
