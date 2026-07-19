import Anthropic from '@anthropic-ai/sdk';
import { assertAnimationPreservesGeometry, rewriteGeometryTypos, validateSceneModule } from '@motionforge/shared';
import { config } from '../config';
import { loadSkill } from '../ai/skills';
import { extractFencedBlocks } from '../ai/extract';

/**
 * Animation agent: LLM calls with the threejs-animation skill.
 * - animateModel: create a one-shot clip from a static base module
 * - modifyAnimation: edit an existing animated module in place
 * The host stores the result as a duplicate clip — base model code stays frozen.
 * Validates the result (and geometry preservation) and retries once on failure.
 */

const JS_LANGS = new Set(['js', 'javascript']);

export interface ModelCode {
  code: string;
}

export async function animateModel(
  client: Anthropic,
  prompt: string,
  code: string,
): Promise<ModelCode> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Add a user-requested, one-shot animation to the current Three.js model.\n\n` +
        `Animation instruction: ${prompt}\n\n` +
        `Current scene module:\n\`\`\`javascript\n${code}\n\`\`\`\n\n` +
        'The host keeps the base model immutable and stores your output as a duplicate ' +
        'animation clip — do not redesign the model; preserve geometry and PARAMS. ' +
        'Prefer ANIMATION.tracks on existing part keys. Insert a pivot/hinge only when ' +
        'correct joint motion requires it. Export ANIMATION with name + duration + tracks[]. ' +
        'Drive motion from time in updateScene (clamp, hold at end — do not loop). ' +
        'Keep every part resting at y >= 0 (do not sink through the floor). ' +
        'Do NOT set or change CAMERA. Only animate what the instruction asks for. ' +
        'Return the complete updated ```javascript block.',
    },
  ];
  return completeWithRetry(client, messages, code);
}

/**
 * Edit an existing animated module. `code` is the current animation duplicate
 * (already has ANIMATION / motion in updateScene), not the frozen base model.
 * Baseline for geometry checks is that animated module so existing pivots stay valid.
 */
export async function modifyAnimation(
  client: Anthropic,
  prompt: string,
  code: string,
): Promise<ModelCode> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Modify the existing one-shot animation on this Three.js module.\n\n` +
        `Modification instruction: ${prompt}\n\n` +
        `Current animated module:\n\`\`\`javascript\n${code}\n\`\`\`\n\n` +
        'This module already has ANIMATION and motion in updateScene — edit that clip ' +
        'in place. Do not scrap it and start over unless the instruction clearly asks ' +
        'for a wholly different action. Preserve geometry, materials, PARAMS, CAMERA, ' +
        'and existing pivot Groups. Keep ANIMATION.name unless the user renames the clip. ' +
        'Adjust ANIMATION.tracks / duration and the motion half of updateScene as needed. ' +
        'Clamp time, hold the final pose (do not loop). Keep every part at y >= 0. ' +
        'Do NOT set or change CAMERA. Only change what the instruction asks for. ' +
        'Return the complete updated ```javascript block.',
    },
  ];
  return completeWithRetry(client, messages, code);
}

async function completeWithRetry(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  baselineCode: string,
): Promise<ModelCode> {
  let errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const stream = client.messages.stream({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      thinking: { type: 'adaptive' },
      system: loadSkill('threejs-animation'),
      messages,
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined to update this scene. Try a different prompt.');
    }
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const blocks = extractFencedBlocks(text);
    const js = blocks.find((block) => JS_LANGS.has(block.lang));
    const code = js ? rewriteGeometryTypos(js.code) : undefined;
    errors = code ? validateSceneModule(code) : ['the response did not include a ```javascript block'];
    if (code && errors.length === 0) {
      errors = assertAnimationPreservesGeometry(baselineCode, code);
    }
    if (code && errors.length === 0) {
      return { code };
    }
    messages.push({ role: 'assistant', content: response.content as Anthropic.MessageParam['content'] });
    messages.push({
      role: 'user',
      content:
        `That response was rejected by the validator: ${errors.join('; ')}. ` +
        'Return a corrected ```javascript block that follows the contract exactly. ' +
        'Do not invent new THREE.Mesh, Geometry, or Material constructors — only new THREE.Group pivots are allowed.',
    });
  }
  throw new Error(`The model did not produce a valid scene module: ${errors.join('; ')}`);
}
