import path from 'node:path';

export interface ServerEntry {
  upstream: string;
  bearer: string;
}

export type Servers = Record<string, ServerEntry>;

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

/**
 * Public URL that clients use to reach this proxy.
 * Must match your reverse proxy / TLS termination.
 */
export const PUBLIC_URL = process.env.PUBLIC_URL || 'https://your-domain.example';

/** Strong secret required for the /admin/* endpoints. */
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'replace-with-strong-admin-token';

/** Token that clients present (Bearer) after the fake OAuth flow. */
export const FIXED_TOKEN = process.env.FIXED_TOKEN || 'replace-with-strong-client-token';

/**
 * Optional allowlist for redirect_uri values accepted by /authorize.
 * Comma-separated absolute URLs; empty means allow any redirect URI.
 */
export const OAUTH_REDIRECT_ALLOWLIST = (process.env.OAUTH_REDIRECT_ALLOWLIST || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

/** In public mode, avoid exposing registered server keys in /health output. */
export const HEALTH_SHOW_SERVERS = parseBool(
  process.env.HEALTH_SHOW_SERVERS,
  false
);

/** Where the registered MCP servers are persisted. */
export const DATA_FILE = path.resolve(
  process.cwd(),
  process.env.DATA_FILE || './servers.json'
);
