import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_TOKEN } from '@/lib/config';
import { getBearerToken, secureTokenEquals } from '@/lib/auth';
import { getServers, saveServers } from '@/lib/servers';

export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  return secureTokenEquals(getBearerToken(req.headers.get('authorization')), ADMIN_TOKEN);
}

// DELETE /api/admin/servers/:key — delete an MCP
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { key } = await params;
  const servers = getServers();

  if (servers[key]) {
    const removed = servers[key];
    delete servers[key];
    try {
      saveServers(servers);
    } catch (err) {
      servers[key] = removed; // roll back the in-memory change
      console.error('Failed to save servers.json:', err);
      return NextResponse.json(
        { error: `Failed to persist servers.json: ${(err as Error).message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, message: `Deleted ${key}` });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
