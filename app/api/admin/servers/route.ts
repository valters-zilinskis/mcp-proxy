import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_TOKEN, PUBLIC_URL } from '@/lib/config';
import { getBearerToken, secureTokenEquals } from '@/lib/auth';
import { getServers, saveServers } from '@/lib/servers';

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

// POST /api/admin/servers — add / update an MCP
// Body: { "key": "obsidian", "upstream": "https://...", "bearer": "..." }
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return unauthorized();

  let data: { key?: string; upstream?: string; bearer?: string };
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!data.key || !data.upstream || !data.bearer) {
    return NextResponse.json(
      { error: 'Missing key, upstream or bearer' },
      { status: 400 }
    );
  }

  // simple validation
  if (!/^[a-z0-9\-]+$/i.test(data.key)) {
    return NextResponse.json(
      { error: 'key may only contain letters, numbers and dashes' },
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

  const servers = getServers();
  servers[data.key] = { upstream: parsed.toString(), bearer: data.bearer };
  try {
    saveServers(servers);
  } catch (err) {
    delete servers[data.key]; // roll back the in-memory change
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
