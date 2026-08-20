import fs from 'node:fs';
import path from 'node:path';
import { DATA_FILE, type Servers } from './config';

let servers: Servers | null = null;

function load(): Servers {
  if (servers) return servers;
  try {
    if (fs.existsSync(DATA_FILE)) {
      servers = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Servers;
      console.log(
        `Loaded ${Object.keys(servers).length} MCP(s) from ${DATA_FILE}`
      );
    } else {
      servers = {};
    }
  } catch (err) {
    // Corrupt file: keep a backup so nothing is lost, then start fresh.
    const backup = `${DATA_FILE}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(DATA_FILE, backup);
      console.error(
        `servers.json was corrupt — moved to ${backup}:`,
        (err as Error).message
      );
    } catch {
      console.error('Failed to load servers.json:', (err as Error).message);
    }
    servers = {};
  }
  return servers;
}

export function getServers(): Servers {
  return load();
}

export function saveServers(next: Servers): void {
  // Ensure the data directory exists (e.g. a fresh bind mount).
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  // Atomic write: temp file + rename so a crash never leaves a half-written file.
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, DATA_FILE);
  servers = next;
  console.log('Saved servers.json');
}
