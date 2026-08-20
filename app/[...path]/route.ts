import { NextRequest, NextResponse } from 'next/server';
import { FIXED_TOKEN, PUBLIC_URL } from '@/lib/config';
import { getBearerToken, secureTokenEquals } from '@/lib/auth';
import { getServers } from '@/lib/servers';

export const dynamic = 'force-dynamic';

/**
 * Catch-all proxy: /<serverKey>/... → upstream MCP server.
 *
 * - Requires `Authorization: Bearer <FIXED_TOKEN>` (the token issued by the
 *   fake OAuth flow at /token).
 * - Forwards the request to the registered upstream, replacing the
 *   Authorization header with the per-server bearer token.
 */
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // CORS preflight is answered locally (same as the original proxy),
  // never forwarded to the upstream.
  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  const { path: parts } = await params;
  const serverKey = parts[0];

  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.nextUrl.pathname}`);

  const servers = getServers();

  if (!serverKey || !servers[serverKey]) {
    return NextResponse.json(
      {
        error: 'not_found',
        message: `Unknown path. Available: ${Object.keys(servers).join(', ') || 'none'}`,
      },
      { status: 404 }
    );
  }

  const target = servers[serverKey];
  const callerToken = getBearerToken(req.headers.get('authorization'));

  if (!secureTokenEquals(callerToken, FIXED_TOKEN)) {
    return NextResponse.json(
      { error: 'unauthorized' },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer FAKESECRET_g3h4i5j6k7l8m9n0o1p2="${PUBLIC_URL}/.well-known/oauth-protected-resource"`,
        },
      }
    );
  }

  // Build the upstream URL, preserving any sub-path and query string.
  const rest = parts.slice(1).join('/');
  const search = req.nextUrl.search || '';
  const upstreamPath = rest ? `/${rest}` : '';
  const targetUrl = new URL(target.upstream);
  const url = `${targetUrl.origin}${targetUrl.pathname.replace(/\/$/, '')}${upstreamPath}${search}`;

  console.log(`→ /${serverKey} → ${url}`);

  // Forward the body for non-GET/HEAD requests.
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;

  // Copy request headers, dropping hop-by-hop headers and replacing auth.
  const headers = new Headers();
  for (const [name, value] of req.headers.entries()) {
    const lower = name.toLowerCase();
    if (
      ['host', 'connection', 'content-length', 'accept-encoding'].includes(lower)
    ) {
      continue;
    }
    headers.set(name, value);
  }
  headers.set('authorization', `Bearer ${target.bearer}`);

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      // MCP uses long-lived SSE streams — don't impose a timeout.
      signal: new AbortController().signal,
    });
  } catch (err) {
    console.error('Upstream error:', (err as Error).message);
    return NextResponse.json({ error: 'Bad Gateway' }, { status: 502 });
  }

  // Copy response headers, dropping hop-by-hop / framing headers that would
  // conflict with the new transport.
  const resHeaders = new Headers();
  for (const [name, value] of upstream.headers.entries()) {
    const lower = name.toLowerCase();
    if (
      [
        'transfer-encoding',
        'content-length',
        'connection',
        'keep-alive',
        'proxy-authenticate',
        'proxy-authorization',
        'te',
        'trailer',
        'upgrade',
      ].includes(lower)
    ) {
      continue;
    }
    resHeaders.set(name, value);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

// MCP clients may use any of these methods against the proxy.
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;

