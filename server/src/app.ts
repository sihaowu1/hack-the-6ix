import express from 'express';
import cors from 'cors';
import { config, rendersDir } from './config';
import { ensureDir } from './utils/fsx';
import { aiAvailable } from './ai/client';
import { generateRouter } from './routes/generate';
import { blenderRouter } from './routes/blender';
import { exportRouter } from './routes/export';

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      ai: aiAvailable(),
      model: config.ai.model,
      blenderEnabled: config.blender.enabled,
    });
  });

  app.use('/api', generateRouter);
  app.use('/api', blenderRouter);
  app.use('/api', exportRouter);

  // Rendered MP4s are served statically so the browser can download them.
  app.use('/renders', express.static(ensureDir(rendersDir)));

  return app;
}
