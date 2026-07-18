import { validateSceneModule, type RenderSettings } from '@motionforge/shared';
import { config } from '../config';
import { createJob, type Job } from '../utils/jobs';
import { renderSceneToMp4 } from '../remotion/renderer';
import { getAnthropicClient } from '../ai/client';
import { planRenderSettings } from '../agents/renderAgent';

/**
 * MP4 export: validates the scene module, optionally lets the render agent
 * (remotion-mp4 skill) plan the settings from a natural-language prompt, then
 * runs the Remotion render as a background job the client polls.
 */
export function startMp4Export(
  code: string,
  overrides: Partial<RenderSettings>,
  prompt: string,
): Job {
  const errors = validateSceneModule(code);
  if (errors.length > 0) {
    throw new Error(`invalid scene module: ${errors.join('; ')}`);
  }

  return createJob(async (update) => {
    let settings: RenderSettings = {
      fps: config.remotion.fps,
      durationInSeconds: config.remotion.durationInSeconds,
      width: config.remotion.width,
      height: config.remotion.height,
      ...overrides,
    };

    const client = getAnthropicClient();
    if (client && prompt.trim()) {
      update({ progress: 0.02, message: 'Planning render settings (remotion-mp4 skill)' });
      settings = await planRenderSettings(client, prompt, code, settings);
    }

    update({ progress: 0.05, message: 'Bundling Remotion project' });
    const { fileName } = await renderSceneToMp4(code, settings, ({ stage, progress }) => {
      update({
        progress,
        message: stage === 'bundle' ? 'Bundling Remotion project' : 'Rendering frames',
      });
    });

    return { url: `/renders/${fileName}`, fileName, settings };
  });
}
