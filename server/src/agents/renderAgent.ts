import type Anthropic from '@anthropic-ai/sdk';
import type { RenderSettings } from '@motionforge/shared';
import { config } from '../config';
import { loadSkill } from '../ai/skills';
import { extractFencedBlocks } from '../ai/extract';

/**
 * The render agent: uses the remotion-mp4 skill to turn a natural-language
 * render request plus the scene code into concrete Remotion settings
 * (fps / duration / resolution). Falls back to the provided defaults on any
 * failure so an MP4 export can never be blocked by planning.
 */
export async function planRenderSettings(
  client: Anthropic,
  prompt: string,
  code: string,
  defaults: RenderSettings,
): Promise<RenderSettings> {
  try {
    const response = await client.messages.create({
      model: config.ai.model,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: loadSkill('remotion-mp4'),
      messages: [
        {
          role: 'user',
          content:
            `Render request: ${prompt || 'no preferences — pick sensible settings'}\n` +
            `Defaults: ${JSON.stringify(defaults)}\n\n` +
            `Scene module:\n\`\`\`javascript\n${code}\n\`\`\``,
        },
      ],
    });
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { text: string }).text)
      .join('\n');
    const json = extractFencedBlocks(text).find((block) => block.lang === 'json')?.code ?? text;
    const parsed = JSON.parse(json) as Partial<RenderSettings>;
    return clampSettings({ ...defaults, ...parsed });
  } catch {
    return defaults;
  }
}

function clampSettings(settings: RenderSettings): RenderSettings {
  const fps = [24, 30, 60].includes(settings.fps) ? settings.fps : 30;
  const durationInSeconds = Math.min(60, Math.max(1, Number(settings.durationInSeconds) || 6));
  const even = (n: number, max: number) => Math.min(max, Math.max(16, Math.round(n / 2) * 2));
  return {
    fps,
    durationInSeconds,
    width: even(Number(settings.width) || 1280, 3840),
    height: even(Number(settings.height) || 720, 2160),
  };
}
