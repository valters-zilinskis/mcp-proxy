'use client';
import { useCallback, useEffect, useState } from 'react';
const TOKEN_STORAGE_KEY = 'mcp-proxy-admin-token';
interface HttpServerEntry {
  type?: 'http';
  upstream: string;
  bearer: string;
}
interface StdioServerEntry {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
type ServerEntry = HttpServerEntry | StdioServerEntry;
export default function AdminPage() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [servers, setServers] = useState<Record<string, ServerEntry> | null>(null);
  const [error, setError] = useState('');
  // form state
  const [key, setKey] = useState('');
  const [serverType, setServerType] = useState<'http' | 'stdio'>('http');
  // http fields
  const [upstream, setUpstream] = useState('');
  const [bearer, setBearer] = useState('');
  // stdio fields
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [envJson, setEnvJson] = useState('');
  const [formMsg, setFormMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/servers', { headers: authHeaders() });
      if (res.status === 401) {
        setServers(null);
        setAuthed(false);
        setError('Invalid admin token');
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return;
      }
      setError('');
      setAuthed(true);
      setServers(await res.json());
    } catch {
      setError('Failed to load servers');
    }
  }, [token, authHeaders]);
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved) setToken(saved);
  }, []);
  useEffect(() => {
    if (token) void refresh();
  }, [token, refresh]);
  function handleTokenChange(value: string) {
    setToken(value);
    if (value) localStorage.setItem(TOKEN_STORAGE_KEY, value);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  function signOut() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken('');
    setAuthed(false);
    setServers(null);
    setError('');
  }
  async function addServer(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    try {
      let payload: Record<string, unknown>;
      if (serverType === 'stdio') {
        const argsArray = args.trim() ? args.trim().split(/s+/) : [];
        let envObj: Record<string, string> = {};
        if (envJson.trim()) {
          try { envObj = JSON.parse(envJson); }
          catch { setFormMsg({ text: 'Env must be valid JSON', ok: false }); return; }
        }
        payload = { key, type: 'stdio', command, args: argsArray, env: envObj };
      } else {
        payload = { key, type: 'http', upstream, bearer };
      }
      const res = await fetch('/api/admin/servers', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let data: { error?: string; message?: string; url?: string } = {};
      try { data = await res.json(); } catch {}
      setFormMsg({ text: `${data.message} → ${data.url}`, ok: true });
      setKey(''); setUpstream(''); setBearer(''); setCommand(''); setArgs(''); setEnvJson('');
      void refresh();
    } catch (err) {
      setFormMsg({ text: (err as Error).message, ok: false });
    }
  }
  async function deleteServer(k: string) {
    try {
      const res = await fetch(`/api/admin/servers/${encodeURIComponent(k)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      void refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  function serverLabel(v: ServerEntry): string {
    if (v.type === 'stdio') return `${v.command} ${(v.args ?? []).join(' ')}`.trim();
    return v.upstream;
  }
  return (
    <main>
      <h1>MCP Bearer Proxy — Admin</h1>
      <p className="subtitle">Register upstream MCP servers behind this proxy.</p>
      <div className="card">
        <h2>Admin token</h2>
        <label htmlFor="token">Bearer token (ADMIN_TOKEN)</label>
        <input id="token" type="password" value={token} placeholder="replace-with-strong-admin-token"
          disabled={authed} onChange={(e) => handleTokenChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void refresh()} />
        {authed && (<><div className="status ok">Signed in — token is stored in this browser.</div><button type="button" onClick={signOut}>Sign out</button></>)}
        {error && <div className="status err">{error}</div>}
      </div>
      <div className="card">
        <h2>Add / update MCP</h2>
        <form onSubmit={addServer}>
          <label htmlFor="key">Key (letters, numbers, dashes)</label>
          <input id="key" value={key} placeholder="my-mcp" onChange={(e) => setKey(e.target.value)} required />
          <label htmlFor="serverType">Type</label>
          <select id="serverType" value={serverType} onChange={(e) => setServerType(e.target.value as 'http' | 'stdio')}>
            <option value="http">HTTP upstream</option>
            <option value="stdio">Stdio process (bridge)</option>
          </select>
          {serverType === 'http' ? (
            <>
              <label htmlFor="upstream">Upstream URL</label>
              <input id="upstream" value={upstream} placeholder="https://my-mcp.example.com/mcp"
                onChange={(e) => setUpstream(e.target.value)} required />
              <label htmlFor="bearer">Bearer token (injected upstream)</label>
              <input id="bearer" value={bearer} placeholder="the-real-token"
                onChange={(e) => setBearer(e.target.value)} required />
            </>
          ) : (
            <>
              <label htmlFor="command">Command</label>
              <input id="command" value={command} placeholder="npx"
                onChange={(e) => setCommand(e.target.value)} required />
              <label htmlFor="args">Arguments (space-separated)</label>
              <input id="args" value={args} placeholder="-y @modelcontextprotocol/server-filesystem /data"
                onChange={(e) => setArgs(e.target.value)} />
              <label htmlFor="envJson">Environment variables (JSON, optional)</label>
              <input id="envJson" value={envJson} placeholder='{API_KEY:secret}'
                onChange={(e) => setEnvJson(e.target.value)} />
            </>
          )}
          <button type="submit">Save</button>
        </form>
        {formMsg && <div className={`status ${formMsg.ok ? 'ok' : 'err'}`}>{formMsg.text}</div>}
      </div>
      <div className="card">
        <h2>Registered MCPs</h2>
        {!servers ? (
          <p className="empty">Enter a valid admin token to list servers.</p>
        ) : Object.keys(servers).length === 0 ? (
          <p className="empty">No MCPs registered yet.</p>
        ) : (
          <table>
            <thead><tr><th>Key</th><th>Type</th><th>Target</th><th>Proxy URL</th><th></th></tr></thead>
            <tbody>
              {Object.entries(servers).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v.type === 'stdio' ? 'stdio' : 'http'}</td>
                  <td className="mono">{serverLabel(v)}</td>
                  <td><a href={`/${k}`} target="_blank" rel="noreferrer">/{k}</a></td>
                  <td><button className="danger" onClick={() => deleteServer(k)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
