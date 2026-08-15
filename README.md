<p align="center">
  <img src="docs/assets/banner.svg" alt="Freebuff Bridge — a focused OpenAI-compatible gateway" width="880">
</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-0.0.149.a-b57920?style=flat-square" alt="Version 0.0.149.a"></a>
  <a href="src/model-catalog.ts"><img src="https://img.shields.io/badge/catalog-6_models-1f6f78?style=flat-square" alt="6 catalog models"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-20%2B-9f4d2e?style=flat-square" alt="Node.js 20+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-28231f?style=flat-square" alt="MIT License"></a>
</p>

<!-- README-I18N:START -->

**English** | [한국어](./README.ko.md)

<!-- README-I18N:END -->

# Freebuff Bridge

Freebuff Bridge is a small Node.js gateway for a Freebuff upstream. It exposes a focused OpenAI-compatible API, manages official Freebuff sessions, and routes requests across multiple account tokens.

Run it on a private or controlled network. The server is HTTP-only and does not configure TLS, a firewall, OCI networking, or a process manager for you.

## What it does

- `GET /v1/models`
- `POST /v1/chat/completions`, including live SSE streaming
- Six catalog entries; five are enabled by default
- Credentials from a JSON file, `FREEBUFF_AUTH_TOKENS`, or the dashboard
- `thin_long` and `short_thick` account routing
- Session heartbeat, cooldown recovery, and pre-output credential failover
- A ko / en / zh dashboard at `/dashboard`

The bridge forwards with the official-compatible User-Agent `ai-sdk/openai-compatible/3.0.25/codebuff` and `cost_mode=free`. It does not launch a CLI subprocess or randomize fingerprints.

## Install

Requirements: Node.js 20 or newer and at least one upstream `authToken`.

```bash
git clone https://github.com/yelixir-dev/freebuff-bridge.git
cd freebuff-bridge
npm install
cp .env.example .env
chmod 600 .env
npm run build
npm start
```

The default address is `http://127.0.0.1:9993`.

## Credentials

There are two different keys.

| Key                  | Purpose                                          | Where it goes                                                      |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| Freebuff `authToken` | Authenticates the bridge to the upstream account | Credentials file, `FREEBUFF_AUTH_TOKENS`, or dashboard **Add key** |
| `BRIDGE_API_KEY`     | Authenticates clients calling this bridge        | `.env`, then `Authorization: Bearer …` or `x-api-key`              |

### Add upstream accounts

The bridge does not perform login. The included helper reads the current `default` login from the Freebuff CLI credential file and copies only its `authToken` to the clipboard:

```bash
freebuff login
npm run token --silent
```

Paste into the dashboard's **Credentials** field, choose **Add key**, switch the account used by `freebuff login`, and repeat. The helper never prints the token unless explicitly requested:

```bash
node scripts/freebuff-token.mjs --print
```

After a global package install, `freebuff-token` provides the same clipboard command. The source file is `~/.config/manicode/credentials.json`; never upload or paste that whole file.

**Environment variable**

```dotenv
FREEBUFF_AUTH_TOKENS=account-token-1,account-token-2
```

**Credentials file**

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

Named top-level objects are also accepted:

```json
{
  "account-1": { "authToken": "account-token-1" },
  "account-2": { "authToken": "account-token-2" }
}
```

Protect the file:

```bash
chmod 600 /opt/freebuff-bridge/accounts.json
```

**Dashboard**

Open `http://127.0.0.1:9993/dashboard`, paste an upstream `authToken` under **Credentials**, and choose **Add key**. Dashboard-added tokens live only in process memory.

For a remote Linux host, copy token values only. Do not copy desktop fingerprint fields, and do not use the same account simultaneously from the desktop CLI and the bridge.

### Set the bridge client key

```dotenv
BRIDGE_API_KEY=sk-fbbr-replace-this-value
```

The dashboard's `sk-` field is this bridge key. It is not a Freebuff `authToken`.

## Oracle Linux VM

Clone and build under a dedicated directory:

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

Keep `HOST=127.0.0.1` with an SSH tunnel or local TLS reverse proxy. Use `HOST=0.0.0.0` only behind an encrypted overlay such as Tailscale or WireGuard, set `BRIDGE_API_KEY`, and restrict the OCI security list or NSG. An NSG alone does not encrypt HTTP traffic.

A minimal unit is tracked at [`deploy/freebuff-bridge.service`](deploy/freebuff-bridge.service):

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

Adjust the user, paths, and Node.js path, then enable it:

```bash
sudo cp deploy/freebuff-bridge.service /etc/systemd/system/freebuff-bridge.service
sudo systemctl daemon-reload
sudo systemctl enable --now freebuff-bridge
```

`POST /admin/restart` does not restart the Node process. Use systemd for real restarts.

## Usage

```bash
curl -fsS http://127.0.0.1:9993/health
```

With `BRIDGE_API_KEY` configured:

```bash
export BRIDGE_API_KEY='sk-fbbr-the-value-from-.env'

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

OpenAI client base URL:

```text
http://host-or-ip:9993/v1
```

Use `BRIDGE_API_KEY` as the client API key.

## Routing and compatibility

- `thin_long`: uses accounts in sequence and limits concurrency to `max(1, floor(accountCount / 5))`.
- `short_thick`: spreads work across accounts up to `FREEBUFF_MAX_CONCURRENT`.
- Exhausted or failed credentials cool down, then become eligible again.
- Active sessions are heartbeated before reuse.
- Retryable failures before visible output can fail over to another credential.

This is not the complete OpenAI API. The bridge preserves prior assistant `tool_calls` and matching tool-result messages, but Freebuff free-mode cannot safely execute arbitrary client tools. Requests containing `tools` must set `tool_choice: "none"`; active tool selection returns a clear `400` instead of silently changing semantics. Sampling fields and `max_tokens` are removed before forwarding.

## Security and persistence

- Set `BRIDGE_API_KEY` before any remote bind.
- CORS is disabled unless `CORS_ORIGIN` is configured.
- `/health` and the static dashboard HTML are public.
- Remote `/v1/*` and `/admin/*` fail closed when no bridge key is configured. A keyless loopback process may bootstrap the dashboard; once a key exists, admin calls require it even through a local reverse proxy.
- Dashboard settings, model toggles, and dashboard-added credentials are in-memory.
- Persist host, port, bridge key, routing, and credentials in `.env` or a credentials file.
- The server has no built-in HTTPS.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run verify
```

## License

MIT. See [LICENSE](LICENSE).
