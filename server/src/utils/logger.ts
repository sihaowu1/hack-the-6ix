import fs from 'node:fs';
import path from 'node:path';

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export function log(tag: string, message: string): void {
  console.log(`[${stamp()}] [${tag}] ${message}`);
}

export function warn(tag: string, message: string): void {
  console.warn(`[${stamp()}] [${tag}] ${message}`);
}

export function logError(tag: string, message: string): void {
  console.error(`[${stamp()}] [${tag}] ${message}`);
}

function safeStringify(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

/**
 * Structured, single-line log for agent pipeline observability. Always prints to
 * the console; when `AGENT_LOG_DIR` is set, also appends one JSONL record per
 * call to `${AGENT_LOG_DIR}/animate-<runId>.jsonl` (best-effort) so a whole run
 * can be read top-to-bottom afterward to improve prompts and skills.
 */
export function logJson(tag: string, payload: Record<string, unknown>): void {
  console.log(`[${stamp()}] [${tag}] ${safeStringify(payload)}`);
  const dir = process.env.AGENT_LOG_DIR;
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const runId = typeof payload.runId === 'string' ? payload.runId : 'misc';
    const record = { ts: new Date().toISOString(), tag, ...payload };
    fs.appendFileSync(path.join(dir, `animate-${runId}.jsonl`), `${JSON.stringify(record)}\n`);
  } catch {
    // Logging must never break a request.
  }
}
