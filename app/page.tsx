import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main>
      <h1>MCP Bearer Proxy</h1>
      <p className="subtitle">
        Multi-MCP proxy with bearer token injection and a fake OAuth flow.
      </p>

      <div className="card">
        <h2>How it works</h2>
        <table>
          <tbody>
            <tr>
              <td>
                <Link href="/health">/health</Link>
              </td>
              <td>Plain-text health check</td>
            </tr>
            <tr>
              <td>
                <Link href="/.well-known/oauth-protected-resource">
                  /.well-known/oauth-protected-resource
                </Link>
              </td>
              <td>OAuth protected-resource metadata</td>
            </tr>
            <tr>
              <td>
                <Link href="/authorize?redirect_uri=http://localhost:3000/callback">
                  /authorize
                </Link>
              </td>
              <td>Fake OAuth authorize (requires redirect_uri)</td>
            </tr>
            <tr>
              <td>/token</td>
              <td>Fake OAuth token endpoint (POST)</td>
            </tr>
            <tr>
              <td>
                <Link href="/admin">/admin</Link>
              </td>
              <td>Admin UI — register upstream MCPs</td>
            </tr>
            <tr>
              <td>/&lt;serverKey&gt;</td>
              <td>Proxies to the registered upstream (Bearer auth required)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Admin API</h2>
        <p className="mono" style={{ fontSize: '0.8rem', color: '#7d8590' }}>
          GET    /api/admin/servers            (Bearer ADMIN_TOKEN)
          <br />
          POST   /api/admin/servers            (Bearer ADMIN_TOKEN)
          <br />
          DELETE /api/admin/servers/:key       (Bearer ADMIN_TOKEN)
        </p>
      </div>
    </main>
  );
}

