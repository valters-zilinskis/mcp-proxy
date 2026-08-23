/**
 * stdio-manager.ts
 *
 * Manages long-lived child processes for stdio-style MCP servers and bridges
 * their JSON-RPC-over-stdio communication to the HTTP layer.
 *
 * One process is spawned per registered stdio server key.  Processes are
 * restarted automatically if they exit unexpectedly.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { StdioServerEntry } from './config';

type JsonRpcId = string | number;

interface Pending {
  resolve: (msg: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ManagedProcess {
  proc: ChildProcess;
  pending: Map<JsonRpcId, Pending>;
  notifyListeners: Set<(msg: unknown) => void>;
}

/** In-process registry of running stdio child processes. */
const managed = new Map<string, ManagedProcess>();

// ---------------------------------------------------------------------------
// Process lifecycle
// ---------------------------------------------------------------------------

function launch(key: string, entry: StdioServerEntry): ManagedProcess {
  const { command, args = [], env = {} } = entry;

  const proc = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  console.log(`[stdio:${key}] Spawned PID ${proc.pid} — ${command} ${args.join(' ')}`);

  const mp: ManagedProcess = {
    proc,
    pending: new Map(),
    notifyListeners: new Set(),
  };

  // Read newline-delimited JSON from stdout.
  const rl = createInterface({ input: proc.stdout! });
  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg: { id?: JsonRpcId | null; [k: string]: unknown };
    try {
      msg = JSON.parse(trimmed);
    } catch {
      console.warn(`[stdio:${key}] Non-JSON from stdout:`, trimmed);
      return;
    }

    if (msg.id != null) {
      // Response to a previously sent request.
      const p = mp.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        mp.pending.delete(msg.id);
        p.resolve(msg);
      }
    } else {
      // Notification (no id) — broadcast to all SSE listeners.
      for (const fn of mp.notifyListeners) {
        try { fn(msg); } catch { /* ignore listener errors */ }
      }
    }
  });

  proc.stderr?.on('data', (d: Buffer) =>
    console.error(`[stdio:${key}] stderr:`, d.toString().trimEnd())
  );

  proc.on('exit', (code, signal) => {
    console.warn(`[stdio:${key}] Process exited — code=${code} signal=${signal}`);
    managed.delete(key);

    // Reject all in-flight requests.
    for (const [, p] of mp.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(`[stdio:${key}] Process exited (code=${code}, signal=${signal})`));
    }
    mp.pending.clear();
  });

  managed.set(key, mp);
  return mp;
}

function getOrLaunch(key: string, entry: StdioServerEntry): ManagedProcess {
  const existing = managed.get(key);
  if (existing && existing.proc.exitCode === null && !existing.proc.killed) {
    return existing;
  }
  return launch(key, entry);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a JSON-RPC **request** (has an `id`) and wait for the matching response.
 * Rejects after `timeoutMs` milliseconds (default 30 s).
 */
export function sendRequest(
  key: string,
  entry: StdioServerEntry,
  message: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const mp = getOrLaunch(key, entry);
    const id = message.id as JsonRpcId;

    const timer = setTimeout(() => {
      mp.pending.delete(id);
      reject(new Error(`[stdio:${key}] Request id=${id} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    mp.pending.set(id, { resolve, reject, timer });
    mp.proc.stdin!.write(JSON.stringify(message) + '\n');
  });
}

/**
 * Send a JSON-RPC **notification** (no `id`). Fire-and-forget — no response
 * is expected from the server.
 */
export function sendNotification(
  key: string,
  entry: StdioServerEntry,
  message: Record<string, unknown>,
): void {
  const mp = getOrLaunch(key, entry);
  mp.proc.stdin!.write(JSON.stringify(message) + '\n');
}

/**
 * Subscribe to server-initiated notifications (used by SSE GET handlers).
 * Returns an unsubscribe function — call it when the client disconnects.
 */
export function subscribe(
  key: string,
  entry: StdioServerEntry,
  fn: (msg: unknown) => void,
): () => void {
  const mp = getOrLaunch(key, entry);
  mp.notifyListeners.add(fn);
  return () => mp.notifyListeners.delete(fn);
}

/**
 * Terminate the process for a given key (called when a server is deleted).
 */
export function killProcess(key: string): void {
  const mp = managed.get(key);
  if (mp) {
    console.log(`[stdio:${key}] Killing process PID ${mp.proc.pid}`);
    mp.proc.kill();
    managed.delete(key);
  }
}

