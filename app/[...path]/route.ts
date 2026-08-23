import { NextRequest, NextResponse } from 'next/server';
import { FIXED_TOKEN, PUBLIC_URL } from '@/lib/config';
import type { StdioServerEntry } from '@/lib/config';
import { getBearerToken, secureTokenEquals } from '@/lib/auth';
import { getServers } from '@/lib/servers';
import { sendRequest, sendNotification, subscribe } from '@/lib/stdio-manager';

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

  // -------------------------------------------------------------------------
  // stdio bridge
  // -------------------------------------------------------------------------
  if (target.type === 'stdio') {
    return handleStdio(req, serverKey, target);
  }

  // -------------------------------------------------------------------------
  // HTTP upstream proxy (original behaviour)
  // -------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// stdio ↔ HTTP bridge handler
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
} as const;

async function handleStdio(
  req: NextRequest,
  key: string,
  entry: StdioServerEntry,
): Promise<NextResponse> {
  // SSE subscription — client wants server-initiated notifications.
  if (req.method === 'GET' && (req.headers.get('accept') ?? '').includes('text/event-stream')) {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    const enc = new TextEncoder();

    // Confirm the connection immediately.
    writer.write(enc.encode(': connected\n\n')).catch(() => {});

    const unsub = subscribe(key, entry, (msg) => {
      const chunk = enc.encode(`data: ${JSON.stringify(msg)}\n\n`);
      writer.write(chunk).catch(() => {});
    });

    req.signal.addEventListener('abort', () => {
      unsub();
      writer.close().catch(() => {});
    });

    return new NextResponse(readable, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  if (req.method === 'POST') {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
    }

    // Batch of messages.
    if (Array.isArray(body)) {
      const results = await Promise.all(
        (body as Record<string, unknown>[]).map(async (msg) => {
          if (msg.id != null) {
            try {
              return await sendRequest(key, entry, msg);
            } catch (err) {
              return {
                jsonrpc: '2.0',
                id: msg.id,
                error: { code: -32603, message: (err as Error).message },
              };
            }
          } else {
            sendNotification(key, entry, msg);
            return null;
          }
        }),
      );
      const responses = results.filter(Boolean);
      if (responses.length === 0) {
        return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
      }
      return NextResponse.json(responses, { headers: CORS_HEADERS });
    }

    // Single message.
    const msg = body as Record<string, unknown>;
    if (msg.id != null) {
      try {
        const response = await sendRequest(key, entry, msg);
        return NextResponse.json(response, { headers: CORS_HEADERS });
      } catch (err) {
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32603, message: (err as Error).message },
          },
          { status: 500, headers: CORS_HEADERS },
        );
      }
    } else {
      // Notification — fire-and-forget.
      sendNotification(key, entry, msg);
      return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
    }
  }

  return NextResponse.json(
    { error: 'Method not supported for stdio servers' },
    { status: 405, headers: CORS_HEADERS },
  );
}

// MCP clients may use any of these methods against the proxy.
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;

