#!/usr/bin/env node
// Frees the ports `npm run dev` is about to bind (web + server) before starting,
// so a previous run that got orphaned (terminal closed instead of Ctrl+C, crash, etc.)
// can't block the next `npm run dev` with EADDRINUSE.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function serverPort() {
  try {
    const env = readFileSync(path.join(repoRoot, '.env'), 'utf8');
    const match = env.match(/^PORT=(\d+)/m);
    if (match) return Number(match[1]);
  } catch {
    // no .env yet, fall through to default
  }
  return 5174;
}

const ports = [5173, serverPort()];

for (const port of ports) {
  try {
    const pids = execSync(`lsof -ti tcp:${port}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const pid of pids) {
      execSync(`kill -9 ${pid}`);
      console.log(`[free-ports] killed stale process ${pid} on port ${port}`);
    }
  } catch {
    // lsof exits non-zero when nothing is listening on the port; nothing to do
  }
}
