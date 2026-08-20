import { NextResponse } from 'next/server';
import { HEALTH_SHOW_SERVERS } from '@/lib/config';
import { getServers } from '@/lib/servers';

export const dynamic = 'force-dynamic';

// Plain-text health endpoint (used by the Docker health check).
export async function GET() {
  if (!HEALTH_SHOW_SERVERS) {
    return new NextResponse('MCP Multi-Proxy running', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const names = Object.keys(getServers());
  return new NextResponse(
    `MCP Multi-Proxy running\nMCPs: ${names.join(', ') || '(none)'}`,
    { status: 200, headers: { 'Content-Type': 'text/plain' } }
  );
}
