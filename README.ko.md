<p align="center">
  <img src="docs/assets/banner.svg" alt="Freebuff Bridge — 필요한 범위에 집중한 OpenAI 호환 게이트웨이" width="880">
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-0.0.149.a-b57920?style=flat-square" alt="Version 0.0.149.a"></a>
  <a href="src/model-catalog.ts"><img src="https://img.shields.io/badge/catalog-6_models-1f6f78?style=flat-square" alt="6 catalog models"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-20%2B-9f4d2e?style=flat-square" alt="Node.js 20+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-28231f?style=flat-square" alt="MIT License"></a>
</p>

<!-- README-I18N:START -->

[English](./README.md) | **한국어**

<!-- README-I18N:END -->

# Freebuff Bridge

Freebuff Bridge는 Freebuff 업스트림을 연결하는 작은 Node.js 게이트웨이다. 필요한 범위의 OpenAI 호환 API를 제공하고, 공식 Freebuff 세션을 관리하며, 여러 계정 토큰 사이에서 요청을 라우팅한다.

사설 또는 직접 통제하는 네트워크에서 실행하라. 서버는 HTTP로 동작하며 TLS, 방화벽, OCI 네트워크, 프로세스 관리자를 대신 설정하지 않는다.

## 기능

- `GET /v1/models`
- 실제 SSE 스트리밍을 포함한 `POST /v1/chat/completions`
- 모델 카탈로그 6개, 기본 활성 모델 5개
- JSON 파일, `FREEBUFF_AUTH_TOKENS`, 대시보드에서 자격증명 등록
- `thin_long`, `short_thick` 계정 라우팅
- 세션 heartbeat, 쿨다운 복구, 출력 전 실패 시 다른 계정 재시도
- `/dashboard`의 ko / en / zh 대시보드

브릿지는 공식 호환 User-Agent `ai-sdk/openai-compatible/3.0.25/codebuff`와 `cost_mode=free`로 전달한다. CLI 서브프로세스를 실행하거나 핑거프린트를 랜덤화하지 않는다.

## 설치

Node.js 20 이상과 업스트림 `authToken` 하나 이상이 필요하다.

```bash
git clone https://github.com/yelixir-dev/freebuff-bridge.git
cd freebuff-bridge
npm install
cp .env.example .env
chmod 600 .env
npm run build
npm start
```

기본 주소는 `http://127.0.0.1:9993`이다.

## 자격증명

두 키를 구분해야 한다.

| 키                   | 용도                                 | 입력 위치                                                   |
| -------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Freebuff `authToken` | 브릿지가 업스트림 계정에 인증        | 자격증명 파일, `FREEBUFF_AUTH_TOKENS`, 대시보드 **키 추가** |
| `BRIDGE_API_KEY`     | 이 브릿지를 호출하는 클라이언트 인증 | `.env`, 이후 `Authorization: Bearer …` 또는 `x-api-key`     |

### 업스트림 계정 추가

브릿지는 로그인을 대신하지 않는다. 포함된 도구는 Freebuff CLI 자격증명 파일의 현재 `default` 로그인에서 `authToken`만 읽어 클립보드에 복사한다.

```bash
freebuff login
npm run token --silent
```

대시보드 **자격 증명** 칸에 붙여넣고 **키 추가**를 누른다. `freebuff login`에서 사용하는 계정을 바꾼 뒤 위 명령을 반복하면 된다. 명시적으로 요청하지 않으면 토큰은 터미널에 표시되지 않는다.

```bash
node scripts/freebuff-token.mjs --print
```

패키지를 전역 설치했다면 `freebuff-token` 명령도 같은 방식으로 클립보드에 복사한다. 원본 파일은 `~/.config/manicode/credentials.json`이며 파일 전체를 업로드하거나 붙여넣지 않는다.

**환경변수**

```dotenv
FREEBUFF_AUTH_TOKENS=account-token-1,account-token-2
```

**자격증명 파일**

```dotenv
FREEBUFF_CREDENTIALS_PATH=/opt/freebuff-bridge/accounts.json
```

```json
{
  "accounts": [
    { "name": "account-1", "authToken": "account-token-1" },
    { "name": "account-2", "authToken": "account-token-2" }
  ]
}
```

이름을 붙인 최상위 객체 형식도 지원한다.

```json
{
  "account-1": { "authToken": "account-token-1" },
  "account-2": { "authToken": "account-token-2" }
}
```

파일 권한을 제한한다.

```bash
chmod 600 /opt/freebuff-bridge/accounts.json
```

**대시보드**

`http://127.0.0.1:9993/dashboard`를 열고 **자격 증명** 아래에 업스트림 `authToken`을 붙여넣은 뒤 **키 추가**를 누른다. 대시보드로 넣은 토큰은 프로세스 메모리에만 있다.

원격 Linux 호스트에는 토큰 값만 복사한다. 데스크톱 핑거프린트 필드는 복사하지 말고, 브릿지가 사용하는 계정을 데스크톱 CLI에서 동시에 사용하지 않는다.

### 브릿지 클라이언트 키 설정

```dotenv
BRIDGE_API_KEY=sk-fbbr-replace-this-value
```

대시보드의 `sk-` 칸은 이 브릿지 키용이다. Freebuff `authToken`을 넣는 칸이 아니다.

## Oracle Linux VM

전용 디렉터리에 clone하고 빌드한다.

```bash
sudo useradd --system --home /opt/freebuff-bridge --shell /sbin/nologin bridge
sudo install -d -o bridge -g bridge /opt/freebuff-bridge
sudo -u bridge git clone https://github.com/yelixir-dev/freebuff-bridge.git /opt/freebuff-bridge
cd /opt/freebuff-bridge
sudo -u bridge npm ci
sudo -u bridge cp .env.example .env
sudo -u bridge chmod 600 .env
sudo -u bridge npm run build
```

SSH 터널이나 로컬 TLS reverse proxy를 쓰면 `HOST=127.0.0.1`을 유지한다. `HOST=0.0.0.0`은 Tailscale·WireGuard 같은 암호화 overlay 뒤에서만 쓰고, `BRIDGE_API_KEY`를 설정하며, OCI security list 또는 NSG도 제한한다. NSG만으로는 HTTP 트래픽이 암호화되지 않는다.

최소 unit은 [`deploy/freebuff-bridge.service`](deploy/freebuff-bridge.service)에 있다.

```ini
[Unit]
Description=Freebuff Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=bridge
WorkingDirectory=/opt/freebuff-bridge
EnvironmentFile=/opt/freebuff-bridge/.env
ExecStart=/usr/bin/node /opt/freebuff-bridge/dist/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

사용자, 경로, Node.js 경로를 VM에 맞게 바꾼 뒤 활성화한다.

```bash
sudo cp deploy/freebuff-bridge.service /etc/systemd/system/freebuff-bridge.service
sudo systemctl daemon-reload
sudo systemctl enable --now freebuff-bridge
```

`POST /admin/restart`는 Node 프로세스를 재시작하지 않는다. 실제 재시작은 systemd로 한다.

## 사용법

```bash
curl -fsS http://127.0.0.1:9993/health
```

`BRIDGE_API_KEY`를 설정했다면:

```bash
export BRIDGE_API_KEY='sk-fbbr-.env에-넣은-값'

curl -fsS \
  -H "Authorization: Bearer $BRIDGE_API_KEY" \
  http://127.0.0.1:9993/v1/models

curl -fsS \
  -H "Authorization: Bearer $BRIDGE_API_KEY" \
  -H "content-type: application/json" \
  http://127.0.0.1:9993/v1/chat/completions \
  -d '{
    "model": "deepseek/deepseek-v4-flash",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

OpenAI 클라이언트 base URL:

```text
http://호스트또는IP:9993/v1
```

클라이언트 API key에는 `BRIDGE_API_KEY`와 같은 값을 쓴다.

## 라우팅과 호환성

- `thin_long`: 계정을 순서대로 사용하며 동시호출은 `max(1, floor(accountCount / 5))`다.
- `short_thick`: `FREEBUFF_MAX_CONCURRENT`까지 계정을 분산 사용한다.
- 소진되거나 실패한 자격증명은 쿨다운 뒤 다시 후보가 된다.
- 활성 세션은 재사용 전에 heartbeat로 확인한다.
- 사용자에게 출력하기 전 발생한 재시도 가능 오류는 다른 계정으로 넘길 수 있다.

완전한 OpenAI API 구현은 아니다. 이전 assistant `tool_calls`와 대응하는 tool-result 메시지는 보존하지만, Freebuff free-mode는 임의의 클라이언트 도구를 안전하게 실행할 수 없다. `tools`를 보내는 요청은 `tool_choice: "none"`이어야 한다. 활성 도구 선택은 의미를 몰래 바꾸지 않고 명확한 `400`으로 거부한다. 샘플링 필드와 `max_tokens`는 전달 전에 제거한다.

## 보안과 유지

- 원격 바인드 전에 반드시 `BRIDGE_API_KEY`를 설정한다.
- `CORS_ORIGIN`을 지정하지 않으면 CORS는 꺼져 있다.
- `/health`와 정적 대시보드 HTML은 공개다.
- 원격 `/v1/*`, `/admin/*`는 브릿지 키가 없으면 닫힌다. 키가 없는 loopback 프로세스만 대시보드를 bootstrap할 수 있고, 키가 생긴 뒤에는 로컬 reverse proxy를 거쳐도 admin 호출에 키가 필요하다.
- 대시보드 설정, 모델 토글, 대시보드에서 추가한 자격증명은 메모리에만 있다.
- 호스트, 포트, 브릿지 키, 라우팅, 자격증명은 `.env` 또는 자격증명 파일로 유지한다.
- 내장 HTTPS는 없다.

## 개발

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify
```

## 라이선스

MIT. [LICENSE](LICENSE)를 확인한다.
