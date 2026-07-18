import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { RenderSettings } from '@motionforge/shared';
import { config, rendersDir } from '../config';
import { ensureDir, repoRoot } from '../utils/fsx';
import { log } from '../utils/logger';

/**
 * Renders a generated scene module to MP4 with Remotion:
 * 1. writes the module into remotion/src/generated/scene-module.js
 * 2. bundles the Remotion project (webpack)
 * 3. renders the GeneratedScene composition frame-by-frame in headless Chrome
 *    (gl=angle so Three.js/WebGL works) and encodes H.264.
 */

const remotionEntry = path.join(repoRoot, 'remotion', 'src', 'index.ts');
const generatedModulePath = path.join(repoRoot, 'remotion', 'src', 'generated', 'scene-module.js');

export interface RenderProgress {
  stage: 'bundle' | 'render';
  progress: number;
}

export interface RenderOutput {
  outputPath: string;
  fileName: string;
}

// Renders are serialized: they share remotion/src/generated/scene-module.js.
let queue: Promise<unknown> = Promise.resolve();

export function renderSceneToMp4(
  code: string,
  settings: RenderSettings,
  onProgress?: (progress: RenderProgress) => void,
): Promise<RenderOutput> {
  const run = queue.then(() => doRender(code, settings, onProgress));
  queue = run.catch(() => undefined);
  return run;
}

async function doRender(
  code: string,
  settings: RenderSettings,
  onProgress?: (progress: RenderProgress) => void,
): Promise<RenderOutput> {
  fs.writeFileSync(generatedModulePath, code);
  onProgress?.({ stage: 'bundle', progress: 0.05 });

  const serveUrl = await bundle({
    entryPoint: remotionEntry,
    onProgress: (percent) => onProgress?.({ stage: 'bundle', progress: 0.05 + (percent / 100) * 0.25 }),
  });

  const inputProps = {
    fps: settings.fps,
    durationInSeconds: settings.durationInSeconds,
    width: settings.width,
    height: settings.height,
  };
  const composition = await selectComposition({
    serveUrl,
    id: config.remotion.compositionId,
    inputProps,
  });

  const fileName = `scene-${Date.now()}.mp4`;
  const outputPath = path.join(ensureDir(rendersDir), fileName);
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    chromiumOptions: { gl: config.remotion.gl as 'angle' },
    onProgress: ({ progress }) => onProgress?.({ stage: 'render', progress: 0.3 + progress * 0.7 }),
  });

  log('remotion', `rendered ${fileName} (${settings.width}x${settings.height} @ ${settings.fps}fps)`);
  return { outputPath, fileName };
}
