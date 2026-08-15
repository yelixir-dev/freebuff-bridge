<p align="center">
  <img src="docs/assets/banner.svg" alt="Freebuff Bridge — OpenAI-compatible gateway for trusted Freebuff deployments" width="880">
</p>

<p align="center">
  <strong>OpenAI-compatible access to Freebuff models, sessions, and multi-account routing inside a trusted network.</strong>
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-0.0.149.a-b57920?style=flat-square" alt="Version 0.0.149.a"></a>
  <a href="src/model-catalog.ts"><img src="https://img.shields.io/badge/models-6-1f6f78?style=flat-square" alt="6 models"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-20%2B-9f4d2e?style=flat-square" alt="Node.js 20+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-28231f?style=flat-square" alt="MIT License"></a>
</p>

<!-- README-I18N:START -->

**English** | [한국어](./README.ko.md)

<!-- README-I18N:END -->

Freebuff Bridge is a trusted-environment HTTP gateway for a Freebuff account. It presents standard OpenAI-compatible model and chat endpoints, admits official CLI sessions on `codebuff.com`, and publishes a **6-model** catalog aligned with Freebuff CLI **0.0.149**. The bridge version always tracks that CLI version with a letter suffix (for example **0.0.149.a**); the suffix marks bridge-only releases.

[What it does](#what-it-does) · [Install](#install) · [Usage](#usage) · [How it works](#how-it-works) · [Repository layout](#repository-layout) · [Current limitations](#current-limitations) · [License](#license)

## What it does

- **OpenAI-compatible API.** Serves `GET /v1/models` and `POST /v1/chat/completions` to any OpenAI client. Default bind is `127.0.0.1:9993`.

- **Official CLI wire, no CLI subprocess.** Chat uses the SDK User-Agent `ai-sdk/openai-compatible/3.0.25/codebuff` and `cost_mode=free`. The bridge does not spawn `freebuff` and does not randomize fingerprints.

- **Multi-account routing.** `thin_long` drains up to five accounts in sequence at concurrency `n/5` (minimum 1). `short_thick` burns several accounts at once up to a configured cap.

- **Session quota awareness.** Exhausted accounts cool down until `resetAt`. Korea is limited-tier: Flash and MiMo share six one-hour sessions per Pacific day.

- **Family dashboard.** `/dashboard` matches CommandCode Bridge (Emil tokens, ko / en / zh, provider folds, two-column credentials).

- **Secret boundary.** Diagnostics redact tokens. Same-origin dashboard writes do not require re-entering the client API key.

## Install

The runtime needs Node.js 20+. There is no installer script in this repository.

```bash
git clone https://github.com/yelixir-dev/freebuff-bridge.git
cd freebuff-bridge
npm install
cp .env.example .env
npm run build
npm start
```

Default bind is `127.0.0.1:9993`. Set `BRIDGE_API_KEY` before exposing `0.0.0.0`.

## Usage

```bash
curl -fsS http://127.0.0.1:9993/health
curl -fsS http://127.0.0.1:9993/v1/models
```

Open `http://127.0.0.1:9993/dashboard` for bind, routing, credentials, and model toggles.

### Adding Freebuff accounts

The official CLI stores one login at `~/.config/manicode/credentials.json`. A Freebuff account is that file's `authToken`, not the bridge `sk-fbbr-…` client key.

1. **Paste in the dashboard.** On a machine with `freebuff login` already done, copy `authToken` from `~/.config/manicode/credentials.json` and use **Add key** on `/dashboard`. Repeat per GitHub account. Dashboard-added tokens live in process memory until restart.

2. **Environment variable (durable).** Put comma-separated tokens in `FREEBUFF_AUTH_TOKENS` in `.env` or the process environment.

3. **Credentials file (durable).** Point `FREEBUFF_CREDENTIALS_PATH` at a JSON object of named accounts or `{ "accounts": [ { "authToken": "…" } ] }`. The default path is `~/.config/manicode/credentials.json`.

For a remote host, copy tokens only. Do not upload a Mac `enhanced-` fingerprint to a cloud IP. Keep the same token off the laptop CLI while the bridge is using it, or the six daily sessions fight.

The `sk-` field on the dashboard is `BRIDGE_API_KEY` for callers of `/v1`. Generate / copy / save it there, or set `BRIDGE_API_KEY` in `.env`.

## How it works

1. Load accounts from the credentials file and `FREEBUFF_AUTH_TOKENS`.
2. `POST /v1/chat/completions` picks a credential under the active routing policy.
3. Admit an official session (`POST /api/v1/freebuff/session`) for that model.
4. Strip `tools` and sampling so free-mode does not trip `foreign_toolset`.
5. Forward chat with the official User-Agent and `x-freebuff-instance-id`.
6. On quota exhaustion, cool the account down until `resetAt` and try the next one.

## Repository layout

```
src/           TypeScript bridge, dashboard, session admit
tests/         vitest coverage for routing, quota, and HTTP
.env.example   Host, port, token, and routing knobs
DESIGN.md      Emil dashboard contract
docs/assets/   README banner
```

## Current limitations

- **Dashboard-added tokens are in-memory.** Persist them with `FREEBUFF_AUTH_TOKENS` or `FREEBUFF_CREDENTIALS_PATH` before a restart.
- **In-process restart is a no-op in source mode.** `POST /admin/restart` does not respawn the Node process.
- **Korean egress is limited-tier.** Flash and MiMo share six sessions; premium models are not admitted.
- **Bind and client-key saves are in-memory until env is updated.** Durable listen address and `BRIDGE_API_KEY` still belong in `.env`.

## License

MIT. See [LICENSE](LICENSE).

<p align="center"><em>Same family as CommandCode Bridge. Official wire, trusted network.</em></p>
