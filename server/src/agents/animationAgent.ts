import Anthropic from '@anthropic-ai/sdk';
import { validateSceneModule, type AspectRatio } from '@motionforge/shared';
import { config } from '../config';
import { loadSkill } from '../ai/skills';
import { extractFencedBlocks } from '../ai/extract';

/**
 * Video agent: classifies the user prompt as animation, composition, or both,
 * then loads threejs-animation and/or camera-composition accordingly.
 */

const JS_LANGS = new Set(['js', 'javascript']);

export type VideoMode = 'animation' | 'composition' | 'both';

export interface ModelCode {
  code: string;
}

export interface AnimateOptions {
  aspectRatio?: AspectRatio;
}

const CLASSIFY_SYSTEM = `You classify Zendai video-editor prompts. Reply with ONLY one word:
animation — part motion, gestures, hinges, waving, walking, posing, keyframe motion
composition — camera, framing, shot type, close-up, wide shot, blocking/layout only (no motion)
both — multi-subject interaction, staged cinematic motion, or a "big" scene that needs framing AND motion

No punctuation or explanation.`;

export async function classifyVideoIntent(
  client: Anthropic,
  prompt: string,
): Promise<VideoMode> {
  const stream = client.messages.stream({
    model: config.ai.model,
    max_tokens: 32,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  const response = await stream.finalMessage();
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
    .toLowerCase();
  if (text.includes('both')) return 'both';
  if (text.includes('composition') || text.includes('compose')) return 'composition';
  if (text.includes('animation') || text.includes('animate')) return 'animation';
  // Heuristic fallback when the model is terse or off-script.
  return heuristicMode(prompt);
}

function heuristicMode(prompt: string): VideoMode {
  const lower = prompt.toLowerCase();
  const compositionHints =
    /\b(camera|close-?up|wide shot|framing|frame|fov|look at|from above|bird'?s.?eye|low angle|high angle|compose|composition|shot)\b/;
  const animationHints =
    /\b(wave|animat|rotate|spin|open|close|nod|walk|jump|move|swing|hinge|gesture|raise|lower|tilt|turn)\b/;
  const bothHints =
    /\b(interact|together|scene|cinematic|stage|between|toward|each other|big|dramatic)\b/;
  const hasComp = compositionHints.test(lower);
  const hasAnim = animationHints.test(lower);
  if (bothHints.test(lower) || (hasComp && hasAnim)) return 'both';
  if (hasComp && !hasAnim) return 'composition';
  return 'animation';
}

function systemForMode(mode: VideoMode): string {
  if (mode === 'composition') return loadSkill('camera-composition');
  if (mode === 'both') {
    return `${loadSkill('threejs-animation')}\n\n---\n\n${loadSkill('camera-composition')}`;
  }
  return loadSkill('threejs-animation');
}

function userPromptForMode(
  mode: VideoMode,
  prompt: string,
  code: string,
  aspectRatio?: AspectRatio,
): string {
  const ratioLine = aspectRatio
    ? `Target preview aspect ratio: ${aspectRatio}. Use it when adjusting CAMERA / blocking.\n\n`
    : '';

  const hostNote =
    'The host keeps the base model immutable and stores your output as a ' +
    'duplicate animation clip — do not redesign the model; preserve geometry and PARAMS. ';

  if (mode === 'composition') {
    return (
      `${ratioLine}` +
      `Reframe / reblock the current Three.js model. Do not invent time-based animation.\n\n` +
      `Composition instruction: ${prompt}\n\n` +
      `Current scene module:\n\`\`\`javascript\n${code}\n\`\`\`\n\n` +
      hostNote +
      'Update CAMERA (position/lookAt/fov); change object placement only if required for the shot. ' +
      'Return the complete updated ```javascript block.'
    );
  }

  if (mode === 'both') {
    return (
      `${ratioLine}` +
      `Add a user-requested one-shot animation AND compose the camera/blocking for this scene.\n\n` +
      `Instruction: ${prompt}\n\n` +
      `Current scene module:\n\`\`\`javascript\n${code}\n\`\`\`\n\n` +
      hostNote +
      'Export ANIMATION with name + duration and tracks[] keyed by existing parts when possible. ' +
      'Insert pivots only when joint motion requires them. Also set CAMERA for a clear framed shot. ' +
      'Drive motion from time (clamp, hold — no loop). Write only this request as the active ANIMATION. ' +
      'Return the complete updated ```javascript block.'
    );
  }

  return (
    `Add a user-requested, one-shot animation to the current Three.js model.\n\n` +
    `Animation instruction: ${prompt}\n\n` +
    `Current scene module:\n\`\`\`javascript\n${code}\n\`\`\`\n\n` +
    hostNote +
    'Prefer ANIMATION.tracks on existing part keys. Insert a pivot/hinge only when ' +
    'correct joint motion requires it. Export ANIMATION with name + duration + tracks[]. ' +
    'Drive motion from time in updateScene (clamp, hold at end — do not loop). ' +
    'Only animate what the instruction asks for. ' +
    'Return the complete updated ```javascript block.'
  );
}

export async function animateModel(
  client: Anthropic,
  prompt: string,
  code: string,
  options: AnimateOptions = {},
): Promise<ModelCode> {
  const mode = await classifyVideoIntent(client, prompt);
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: userPromptForMode(mode, prompt, code, options.aspectRatio),
    },
  ];
  return completeWithRetry(client, messages, mode);
}

async function completeWithRetry(
  client: Anthropic,
  messages: Anthropic.MessageParam[],
  mode: VideoMode,
): Promise<ModelCode> {
  let errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const stream = client.messages.stream({
      model: config.ai.model,
      max_tokens: config.ai.maxTokens,
      thinking: { type: 'adaptive' },
      system: systemForMode(mode),
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
    errors = js ? validateSceneModule(js.code) : ['the response did not include a ```javascript block'];
    if (js && errors.length === 0) {
      return { code: js.code };
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
