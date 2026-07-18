import type { GenerationResult, RenderSettings } from '@motionforge/shared';

/** Thin typed client for the Zendai server API (proxied through Vite). */

export interface BlenderStatus {
  enabled: boolean;
  connected: boolean;
  tools: string[];
}

export interface BlenderAgentResult {
  steps: Array<{ type: 'text' | 'tool'; detail: string }>;
  finalText: string;
}

export interface Mp4JobResponse {
  id: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  message: string;
  result?: { url: string; fileName: string; settings: RenderSettings };
  error?: string;
}

async function parseError(response: Response): Promise<Error> {
  let message = `${response.status} ${response.statusText}`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) message = body.error;
  } catch {
    // response body was not JSON
  }
  return new Error(message);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw await parseError(response);
  return response.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await parseError(response);
  return response.json() as Promise<T>;
}

export const generate = (prompt: string) =>
  postJson<GenerationResult>('/api/generate', { prompt });

export const modify = (prompt: string, code: string, blenderCode: string) =>
  postJson<GenerationResult>('/api/modify', { prompt, code, blenderCode });

export const getBlenderStatus = () => getJson<BlenderStatus>('/api/blender/status');

export const blenderSync = (code: string) =>
  postJson<{ output: string }>('/api/blender/sync', { code });

export const blenderAgent = (prompt: string) =>
  postJson<BlenderAgentResult>('/api/blender/agent', { prompt });

export const startMp4Export = (code: string, settings: RenderSettings) =>
  postJson<{ jobId: string }>('/api/export/mp4', { code, settings });

export const getMp4Job = (jobId: string) =>
  getJson<Mp4JobResponse>(`/api/export/mp4/${jobId}`);

export async function exportCodeZip(code: string, blenderCode: string): Promise<Blob> {
  const response = await fetch('/api/export/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, blenderCode }),
  });
  if (!response.ok) throw await parseError(response);
  return response.blob();
}
