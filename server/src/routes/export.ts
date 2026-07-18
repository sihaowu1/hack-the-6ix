import { Router } from 'express';
import type { RenderSettings } from '@motionforge/shared';
import { streamProjectZip } from '../export/codeExport';
import { startMp4Export } from '../export/mp4Export';
import { getJob } from '../utils/jobs';
import { logError } from '../utils/logger';

export const exportRouter = Router();

// Download the generated project as code (ZIP).
exportRouter.post('/export/code', (req, res) => {
  const code = String(req.body?.code ?? '');
  if (!code.trim()) {
    res.status(400).json({ error: 'code is required' });
    return;
  }
  streamProjectZip(res, {
    code,
    blenderCode: typeof req.body?.blenderCode === 'string' ? req.body.blenderCode : undefined,
    title: typeof req.body?.title === 'string' ? req.body.title : undefined,
  });
});

// Start an MP4 render (background job; poll the jobId for progress).
exportRouter.post('/export/mp4', (req, res) => {
  const code = String(req.body?.code ?? '');
  const settings = (req.body?.settings ?? {}) as Partial<RenderSettings>;
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
  try {
    const job = startMp4Export(code, settings, prompt);
    res.json({ jobId: job.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('export', message);
    res.status(400).json({ error: message });
  }
});

// Poll MP4 render progress; when done, result.url points at the file.
exportRouter.get('/export/mp4/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'unknown job' });
    return;
  }
  res.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    result: job.result,
    error: job.error,
  });
});
