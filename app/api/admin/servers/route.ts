import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_TOKEN, PUBLIC_URL } from '@/lib/config';
import { getBearerToken, secureTokenEquals } from '@/lib/auth';
import { getServers, saveServers } from '@/lib/servers';
import { killProcess } from '@/lib/stdio-manager';

export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  return secureTokenEquals(getBearerToken(req.headers.get('authorization')), ADMIN_TOKEN);
}

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

// GET /api/admin/servers — list all registered MCPs
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return unauthorized();
  return NextResponse.json(getServers());
}

// POST /api/admin/servers — add / update an MCP (HTTP or stdio)
// HTTP body:  { "key": "my-http", "type": "http",  "upstream": "https://...", "bearer": "..." }
// Stdio body: { "key": "my-stdio", "type": "stdio", "command": "npx", "args": ["-y", "some-mcp"], "env": {} }
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return unauthorized();

  let data: {
    key?: string;
    type?: string;
    // http fields
    upstream?: string;
    bearer?: string;
    // stdio fields
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!data.key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  }

  // simple key validation
  if (!/^[a-z0-9\-]+$/i.test(data.key)) {
    return NextResponse.json(
      { error: 'key may only contain letters, numbers and dashes' },
      { status: 400 }
    );
  }

  const serverType = data.type ?? 'http';

  const servers = getServers();

  // ── stdio ──────────────────────────────────────────────────────────────────
  if (serverType === 'stdio') {
    if (!data.command || !data.command.trim()) {
      return NextResponse.json({ error: 'Missing command for stdio server' }, { status: 400 });
    }

    // If the process was already running under this key, restart it.
    killProcess(data.key);

    servers[data.key] = {
      type: 'stdio',
      command: data.command.trim(),
      args: Array.isArray(data.args) ? data.args : [],
      env: data.env && typeof data.env === 'object' ? data.env : {},
    };

    try {
      saveServers(servers);
    } catch (err) {
      delete servers[data.key];
      console.error('Failed to save servers.json:', err);
      return NextResponse.json(
        { error: `Failed to persist servers.json: ${(err as Error).message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Stdio MCP "${data.key}" saved`,
      url: `${PUBLIC_URL}/${data.key}`,
    });
  }

  // ── http (default) ─────────────────────────────────────────────────────────
  if (!data.upstream || !data.bearer) {
    return NextResponse.json(
      { error: 'Missing upstream or bearer for http server' },
      { status: 400 }
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(data.upstream);
  } catch {
    return NextResponse.json({ error: 'upstream must be a valid absolute URL' }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return NextResponse.json({ error: 'upstream must use http or https' }, { status: 400 });
  }

  servers[data.key] = { type: 'http', upstream: parsed.toString(), bearer: data.bearer };
  try {
    saveServers(servers);
  } catch (err) {
    delete servers[data.key];
    console.error('Failed to save servers.json:', err);
    return NextResponse.json(
      { error: `Failed to persist servers.json: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: `MCP "${data.key}" saved`,
    url: `${PUBLIC_URL}/${data.key}`,
  });
}
