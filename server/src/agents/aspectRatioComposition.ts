import Anthropic from '@anthropic-ai/sdk';
import { validateSceneModule, DEFAULT_ASPECT_RATIO, type AspectRatio } from '@motionforge/shared';
import { config } from '../config';
import { loadSkill } from '../ai/skills';
import { extractFencedBlocks } from '../ai/extract';

/**
 * Standalone aspect-ratio-aware model composition.
 *
 * This is NOT wired into `orchestrator.ts`, any route, or the chat panel —
 * nothing in the running app calls it. It exists to show how a caller would
 * pass a target `AspectRatio` into the `camera-composition` skill (see
 * `skills/camera-composition/SKILL.md`'s "Aspect ratio" section) so the model
 * can acknowledge it and frame the shot for it, without touching the
 * `threejs-modelling`/chat generate-modify pipeline in `modelAgent.ts`.
 */

export interface AspectRatioModelResult {
  code: string;
  /** The model's prose outside the code fences — expected to open with a one-line aspect-ratio acknowledgment. */
  note?: string;
}

const JS_LANGS = new Set(['js', 'javascript']);

function aspectRatioLine(aspectRatio: AspectRatio): string {
  return (
    `Target preview aspect ratio: ${aspectRatio} (width:height). Acknowledge it in one short sentence, ` +
    'then compose the camera and object placement for it per the camera-composition skill.'
  );
}

/**
 * Generates a model for a given prompt + aspect ratio using the
 * `threejs-modelling` and `camera-composition` skills together. Standalone —
 * see module doc comment.
 */
export async function generateModelForAspectRatio(
  client: Anthropic,
  prompt: string,
  aspectRatio: AspectRatio = DEFAULT_ASPECT_RATIO,
): Promise<AspectRatioModelResult> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Create a component-based static Three.js model from this prompt:\n\n${prompt}\n\n` +
        `${aspectRatioLine(aspectRatio)}\n\n` +
        'Return the ```javascript scene module.',
    },
  ];

  let errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const stream = client.messages.stream({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      thinking: { type: 'adaptive' },
      system: `${loadSkill('threejs-modelling')}\n\n${loadSkill('scene-blocking')}\n\n${loadSkill('camera-composition')}`,
      messages,
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined to generate this model. Try a different prompt.');
    }
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const blocks = extractFencedBlocks(text);
    const js = blocks.find((block) => JS_LANGS.has(block.lang));
    errors = js ? validateSceneModule(js.code) : ['the response did not include a ```javascript block'];
    if (js && errors.length === 0) {
      const note = text.replace(/```[\s\S]*?```/g, '').trim();
      return { code: js.code, note: note || undefined };
    }
    messages.push({ role: 'assistant', content: response.content as Anthropic.MessageParam['content'] });
    messages.push({
      role: 'user',
      content:
        `That response was rejected by the validator: ${errors.join('; ')}. ` +
        'Return a corrected ```javascript block that follows the contract exactly.',
    });
  }
  throw new Error(`The model did not produce a valid scene module: ${errors.join('; ')}`);
}
