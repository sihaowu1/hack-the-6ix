import { Router } from 'express';
import { animateScene, generateScene, modifyScene } from '../agents/orchestrator';
import { logError } from '../utils/logger';

export const generateRouter = Router();

// Prompt → new scene (Three.js module + Blender script + tunables).
generateRouter.post('/generate', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim();
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  try {
    res.json(await generateScene(prompt));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('generate', message);
    res.status(500).json({ error: message });
  }
});

// Prompt + current code → modified scene.
generateRouter.post('/modify', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim();
  const code = String(req.body?.code ?? '');
  const blenderCode = String(req.body?.blenderCode ?? '');
  if (!prompt || !code) {
    res.status(400).json({ error: 'prompt and code are required' });
    return;
  }
  try {
    res.json(await modifyScene(prompt, code, blenderCode));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('modify', message);
    res.status(500).json({ error: message });
  }
});

// Prompt + current code → scene with a one-shot timeline animation.
generateRouter.post('/animate', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim();
  const code = String(req.body?.code ?? '');
  const blenderCode = String(req.body?.blenderCode ?? '');
  if (!prompt || !code) {
    res.status(400).json({ error: 'prompt and code are required' });
    return;
  }
  try {
    res.json(await animateScene(prompt, code, blenderCode));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError('animate', message);
    res.status(500).json({ error: message });
  }
});
