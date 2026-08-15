<p align="center">
  <img src="docs/assets/banner.svg" alt="Freebuff Bridge — 신뢰 네트워크용 Freebuff OpenAI 호환 게이트웨이" width="880">
</p>

<p align="center">
  <strong>신뢰 네트워크 안에서 Freebuff 모델, 세션, 멀티계정 라우팅을 OpenAI 호환으로 씁니다.</strong>
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-0.0.149.a-b57920?style=flat-square" alt="Version 0.0.149.a"></a>
  <a href="src/model-catalog.ts"><img src="https://img.shields.io/badge/models-6-1f6f78?style=flat-square" alt="6 models"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-20%2B-9f4d2e?style=flat-square" alt="Node.js 20+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-28231f?style=flat-square" alt="MIT License"></a>
</p>

<!-- README-I18N:START -->

[English](./README.md) | **한국어**

<!-- README-I18N:END -->

Freebuff Bridge는 Freebuff 계정용 신뢰 환경 HTTP 게이트웨이다. 표준 OpenAI 호환 모델·채팅 엔드포인트를 열고, `codebuff.com`에 공식 CLI 세션을 입장시키며, Freebuff CLI **0.0.149**에 맞춘 **6모델** 카탈로그를 게시한다. 브릿지 버전은 그 CLI 버전에 글자 접미사(예: **0.0.149.a**)를 붙이며, 접미사는 브릿지 전용 릴리스를 뜻한다.

[하는 일](#하는-일) · [설치](#설치) · [사용법](#사용법) · [동작 방식](#동작-방식) · [저장소 구조](#저장소-구조) · [현재 한계](#현재-한계) · [라이선스](#라이선스)

## 하는 일

- **OpenAI 호환 API.** 모든 OpenAI 클라이언트에 `GET /v1/models`와 `POST /v1/chat/completions`를 제공한다. 기본 바인드는 `127.0.0.1:9993`이다.

- **공식 CLI 와이어, CLI 서브프로세스 없음.** 채팅은 SDK User-Agent `ai-sdk/openai-compatible/3.0.25/codebuff`와 `cost_mode=free`를 쓴다. `freebuff`를 띄우지 않고 핑거프린트를 랜덤화하지 않는다.

- **멀티계정 라우팅.** `thin_long`은 계정을 최대 다섯 개까지 연속 소진하고 동시호출은 `n/5`(최소 1)다. `short_thick`는 설정한 상한까지 여러 계정을 동시에 태운다.

- **세션 쿼타 인식.** 소진된 계정은 `resetAt`까지 쿨다운한다. 한국은 limited: Flash와 MiMo가 태평양 하루 6장을 나눠 쓴다.

- **패밀리 대시보드.** `/dashboard`는 CommandCode Bridge와 같다 (Emil 토큰, ko / en / zh, 프로바이더 폴드, 자격증명 2열).

- **시크릿 경계.** 진단은 토큰을 가린다. 동일 출처 대시보드 쓰기는 클라이언트 API 키를 다시 넣지 않는다.

## 설치

런타임은 Node.js 20+가 필요하다. 이 저장소에는 인스톨러 스크립트가 없다.

```bash
git clone https://github.com/yelixir-dev/freebuff-bridge.git
cd freebuff-bridge
npm install
cp .env.example .env
npm run build
npm start
```

기본 바인드는 `127.0.0.1:9993`이다. `0.0.0.0`을 열기 전에 `BRIDGE_API_KEY`를 켠다.

## 사용법

```bash
curl -fsS http://127.0.0.1:9993/health
curl -fsS http://127.0.0.1:9993/v1/models
```

바인드·라우팅·자격증명·모델 토글은 `http://127.0.0.1:9993/dashboard`에서 한다.

### Freebuff 계정 추가

공식 CLI는 `~/.config/manicode/credentials.json`에 로그인 하나를 둔다. Freebuff 계정은 그 파일의 `authToken`이지, 브릿지 `sk-fbbr-…` 클라이언트 키가 아니다.

1. **대시보드에 붙여넣기.** `freebuff login`이 끝난 머신에서 `~/.config/manicode/credentials.json`의 `authToken`을 복사해 `/dashboard`의 **키 추가**에 넣는다. GitHub 계정마다 반복한다. 대시보드로 넣은 토큰은 재시작 전까지 프로세스 메모리에만 있다.

2. **환경변수 (유지됨).** `.env` 또는 프로세스 환경의 `FREEBUFF_AUTH_TOKENS`에 쉼표로 구분한 토큰을 넣는다.

3. **자격증명 파일 (유지됨).** `FREEBUFF_CREDENTIALS_PATH`를 이름 붙은 계정 객체나 `{ "accounts": [ { "authToken": "…" } ] }` JSON으로 가리킨다. 기본 경로는 `~/.config/manicode/credentials.json`이다.

원격 호스트에는 토큰만 복사한다. 맥 `enhanced-` 핑거프린트를 클라우드 IP로 올리지 않는다. 브릿지가 쓰는 동안 같은 토큰으로 노트북 CLI를 켜 두면 하루 6장이 싸운다.

대시보드의 `sk-` 칸은 `/v1` 호출자용 `BRIDGE_API_KEY`다. 거기서 생성·복사·저장하거나 `.env`의 `BRIDGE_API_KEY`를 쓴다.

## 동작 방식

1. 자격증명 파일과 `FREEBUFF_AUTH_TOKENS`에서 계정을 읽는다.
2. `POST /v1/chat/completions`가 활성 라우팅 정책으로 자격증명을 고른다.
3. 그 모델로 공식 세션(`POST /api/v1/freebuff/session`)을 입장시킨다.
4. `tools`와 샘플링을 벗겨 free-mode가 `foreign_toolset`에 걸리지 않게 한다.
5. 공식 User-Agent와 `x-freebuff-instance-id`로 채팅을 전달한다.
6. 쿼타가 끝나면 `resetAt`까지 쿨다운하고 다음 계정으로 간다.

## 저장소 구조

```
src/           TypeScript bridge, dashboard, session admit
tests/         vitest coverage for routing, quota, and HTTP
.env.example   Host, port, token, and routing knobs
DESIGN.md      Emil dashboard contract
docs/assets/   README banner
```

## 현재 한계

- **대시보드로 넣은 토큰은 메모리에만 있다.** 재시작 전에 `FREEBUFF_AUTH_TOKENS`나 `FREEBUFF_CREDENTIALS_PATH`로 남겨라.
- **소스 모드에서 인프로세스 재시작은 no-op이다.** `POST /admin/restart`는 Node 프로세스를 다시 띄우지 않는다.
- **한국 출구는 limited다.** Flash와 MiMo가 6장을 나누고, premium은 입장되지 않는다.
- **바인드와 클라이언트 키 저장은 env를 고치기 전까지 메모리다.** 유지되는 listen 주소와 `BRIDGE_API_KEY`는 여전히 `.env`에 둔다.

## 라이선스

MIT. [LICENSE](LICENSE)를 본다.

<p align="center"><em>CommandCode Bridge와 같은 패밀리. 공식 와이어, 신뢰 네트워크.</em></p>
