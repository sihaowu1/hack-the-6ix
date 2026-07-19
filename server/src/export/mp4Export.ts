import { rewriteGeometryTypos, validateSceneModule, type RenderSettings } from '@motionforge/shared';
import { config } from '../config';
import { createJob, type Job } from '../utils/jobs';
import { renderSceneToMp4 } from '../remotion/renderer';

/**
 * MP4 export: validates the scene module, merges caller settings with config
 * defaults, then runs the Remotion render as a background job the client polls.
 */
export function startMp4Export(code: string, overrides: Partial<RenderSettings>): Job {
  const normalized = rewriteGeometryTypos(code);
  const errors = validateSceneModule(normalized);
  if (errors.length > 0) {
    throw new Error(`invalid scene module: ${errors.join('; ')}`);
  }

  return createJob(async (update) => {
    const settings: RenderSettings = {
      fps: config.remotion.fps,
      durationInSeconds: config.remotion.durationInSeconds,
      width: config.remotion.width,
      height: config.remotion.height,
      ...overrides,
    };

    update({ progress: 0.05, message: 'Bundling Remotion project' });
    const { fileName } = await renderSceneToMp4(normalized, settings, ({ stage, progress }) => {
      update({
        progress,
        message: stage === 'bundle' ? 'Bundling Remotion project' : 'Rendering frames',
      });
    });

    return { url: `/renders/${fileName}`, fileName, settings };
  });
}
