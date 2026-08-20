# MCP Bearer Proxy (Next.js)

A small multi-MCP proxy that:

- exposes a single public endpoint,
- performs a lightweight OAuth-like handshake for clients,
- forwards requests to named upstream MCP servers,
- injects a per-upstream bearer token on outbound requests.

This project is intended for MCP clients (for example, Grok-style clients) that require OAuth-style discovery/auth flows, while many local MCP servers do not support OAuth directly.

## Disclaimer

This project is provided **as-is with no maintenance or security support commitment**. It may not be updated in the future. Deploy and use it at your own risk — review the code before running it publicly. See `SECURITY.md` and `LICENSE` for the full disclaimer.

## Important security notes

- This project implements a **fake OAuth flow** for client compatibility and bearer-token proxying. It is not a full OAuth authorization server.
- Treat `ADMIN_TOKEN`, `FIXED_TOKEN`, and all upstream bearer tokens as secrets.
- Keep `servers.json` out of source control in real deployments.

## Endpoints

| Endpoint | Description |
| --- | --- |
| `/health` | Health check |
| `/.well-known/oauth-protected-resource` | OAuth protected-resource metadata |
| `/.well-known/oauth-authorization-server` / `/.well-known/openid-configuration` | OAuth server metadata |
| `/authorize?redirect_uri=...&state=...` | Redirects back with an auth code |
| `/token` (POST) | Issues `FIXED_TOKEN` |
| `/admin` | Admin UI |
| `/api/admin/servers` (GET/POST) | List / add-update MCPs (`Bearer ADMIN_TOKEN`) |
| `/api/admin/servers/:key` (DELETE) | Delete MCP (`Bearer ADMIN_TOKEN`) |
| `/<serverKey>/...` | Proxies to selected upstream (`Bearer FIXED_TOKEN`) |

## Configuration

Copy `.env.example` to `.env.local` (local dev) or set variables in your deployment.

| Variable | Description |
| --- | --- |
| `PUBLIC_URL` | Public base URL of this proxy |
| `ADMIN_TOKEN` | Secret required for `/api/admin/*` |
| `FIXED_TOKEN` | Token clients present after `/token` |
| `OAUTH_REDIRECT_ALLOWLIST` | Optional comma-separated list of exact redirect URIs allowed at `/authorize` |
| `HEALTH_SHOW_SERVERS` | If `true`, `/health` includes registered server keys |
| `DATA_FILE` | Persistence path for registered upstream MCPs |
| `PORT` | Runtime port |

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Default URL: `http://localhost:8787`

## Docker (public-ready template)

1. Create `.env` from `.env.example` and set strong secrets.
2. Optionally create `./data/servers.json` from `servers.example.json`.

```bash
docker compose up -d --build
```

If you want the optional GitHub MCP sidecar service:

```bash
docker compose --profile github up -d
```

## Runtime data files

- `servers.json` is runtime state and may contain sensitive upstream tokens.
- `servers.example.json` is a safe template.

## Project structure

```
app/
  [...path]/route.ts        # catch-all proxy: /<serverKey>/... -> upstream
  admin/page.tsx            # admin UI
  page.tsx                  # landing page
  health/route.ts           # /health
  authorize/route.ts        # fake OAuth authorize
  token/route.ts            # fake OAuth token
  api/admin/servers/...     # admin API
lib/
  config.ts                 # env configuration
  servers.ts                # servers persistence
  auth.ts                   # bearer parsing and constant-time compare
```
