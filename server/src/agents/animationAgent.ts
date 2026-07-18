import Anthropic from '@anthropic-ai/sdk';
import {
  extractCameraLiteral,
  replaceCameraLiteral,
  stitchMergeAnimation,
  validateSceneModule,
  type AspectRatio,
} from '@motionforge/shared';
import { config } from '../config';
import { loadSkill } from '../ai/skills';
import { extractFencedBlocks } from '../ai/extract';

/**
 * Video agent: a small multi-agent pipeline.
 *
 *   Director (JSON plan) → N animation agents (one per subject, parallel)
 *     → deterministic stitch → Camera agent (composition), when needed.
 *
 * Single models are the degenerate case: one subject ("self"), no stitch.
 * Merges send their pristine child modules so each subject is animated in
 * isolation, then re-fused deterministically (no LLM rewrites the wrapper).
 */

const JS_LANGS = new Set(['js', 'javascript']);

export type VideoMode = 'animation' | 'composition' | 'both';

export interface ModelCode {
  code: string;
}

/** A merge child (pristine module snapshot) sent for per-subject animation. */
export interface AnimateChild {
  id: string;
  name: string;
  code: string;
}

export interface AnimateOptions {
  aspectRatio?: AspectRatio;
  children?: AnimateChild[];
}

interface PlanSubject {
  id: string;
  brief: string;
}

interface VideoPlan {
  mode: VideoMode;
  name: string;
  duration: number;
  subjects: PlanSubject[];
  cameraBrief: string | null;
}

const SELF_SUBJECT_ID = 'self';

// ─── Director ────────────────────────────────────────────────────────────────

const DIRECTOR_SYSTEM = `You are the director for Zendai's video editor. You do NOT write code.
Given a user prompt and the list of subjects in the scene, produce a JSON plan that
splits the work for downstream animation agents (one per subject) and a camera agent.

Reply with ONLY a single JSON object (no prose, no code fences) of this exact shape:
{
  "mode": "animation" | "composition" | "both",
  "name": "shortClipId",
  "duration": <number seconds, one shared playout length for every subject>,
  "subjects": [ { "id": "<subject id>", "brief": "<what THIS subject does, or empty string if it stays still>" } ],
  "cameraBrief": "<shot type / framing instruction, or null when no camera work is requested>"
}

Rules:
- "mode": "animation" = motion only; "composition" = camera/framing only (no motion);
  "both" = motion AND camera. Multi-subject interaction usually implies "both".
- Include an entry in "subjects" for EVERY provided subject id, in order. Give a subject
  an empty brief when the prompt does not move it.
- "duration" is a single shared number for the whole clip (choose 1-6s if unstated).
- Keep each brief focused on one subject; describe interaction timing in the briefs.
- "cameraBrief" must be null unless mode is "composition" or "both".`;

function heuristicPlan(prompt: string, subjects: Array<{ id: string; name: string }>): VideoPlan {
  const lower = prompt.toLowerCase();
  const compositionHints =
    /\b(camera|close-?up|wide shot|framing|frame|fov|look at|from above|bird'?s.?eye|low angle|high angle|compose|composition|shot)\b/;
  const animationHints =
    /\b(wave|animat|rotate|spin|open|close|nod|walk|jump|move|swing|hinge|gesture|raise|lower|tilt|turn)\b/;
  const bothHints =
    /\b(interact|together|scene|cinematic|stage|between|toward|each other|big|dramatic)\b/;
  const hasComp = compositionHints.test(lower);
  const hasAnim = animationHints.test(lower);
  const multi = subjects.length > 1;
  let mode: VideoMode = 'animation';
  if (bothHints.test(lower) || (hasComp && hasAnim) || (multi && hasComp)) mode = 'both';
  else if (hasComp && !hasAnim) mode = 'composition';

  return {
    mode,
    name: 'clip',
    duration: 3,
    subjects: subjects.map((s) => ({ id: s.id, brief: mode === 'composition' ? '' : prompt })),
    cameraBrief: mode === 'composition' || mode === 'both' ? prompt : null,
  };
}

function coerceMode(value: unknown): VideoMode | undefined {
  if (value === 'animation' || value === 'composition' || value === 'both') return value;
  return undefined;
}

export async function planVideo(
  client: Anthropic,
  prompt: string,
  subjects: Array<{ id: string; name: string }>,
): Promise<VideoPlan> {
  const subjectList = subjects.map((s) => `- id "${s.id}": ${s.name}`).join('\n');
  const stream = client.messages.stream({
    model: config.ai.model,
    max_tokens: 512,
    system: DIRECTOR_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `User prompt: ${prompt}\n\nSubjects in the scene:\n${subjectList}\n\nReturn the JSON plan.`,
      },
    ],
  });
  const response = await stream.finalMessage();
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const parsed = safeParsePlan(text, subjects);
  return parsed ?? heuristicPlan(prompt, subjects);
}

function safeParsePlan(
  text: string,
  subjects: Array<{ id: string; name: string }>,
): VideoPlan | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const mode = coerceMode(obj.mode);
  if (!mode) return null;

  const duration =
    typeof obj.duration === 'number' && Number.isFinite(obj.duration) && obj.duration > 0
      ? obj.duration
      : 3;
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'clip';

  const briefById = new Map<string, string>();
  if (Array.isArray(obj.subjects)) {
    for (const entry of obj.subjects) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.id === 'string') briefById.set(e.id, typeof e.brief === 'string' ? e.brief : '');
    }
  }
  const planSubjects: PlanSubject[] = subjects.map((s) => ({
    id: s.id,
    brief: briefById.get(s.id) ?? '',
  }));

  const cameraBrief =
    typeof obj.cameraBrief === 'string' && obj.cameraBrief.trim().toLowerCase() !== 'null'
      ? obj.cameraBrief.trim()
      : null;

  return { mode, name, duration, subjects: planSubjects, cameraBrief };
}

// ─── Low-level completion ────────────────────────────────────────────────────

async function complete(
  client: Anthropic,
  system: string,
  messages: Anthropic.MessageParam[],
): Promise<Anthropic.Message> {
  const stream = client.messages.stream({
    model: config.ai.model,
    max_tokens: config.ai.maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages,
  });
  return stream.finalMessage();
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/** Run one agent that must return a complete, valid scene module. */
async function completeModule(
  client: Anthropic,
  system: string,
  firstUserContent: string,
): Promise<ModelCode> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: firstUserContent }];
  let errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await complete(client, system, messages);
    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined to update this scene. Try a different prompt.');
    }
    const text = textOf(response);
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

// ─── Animation agent (one subject) ───────────────────────────────────────────

function animationPrompt(brief: string, code: string, duration: number): string {
  return (
    `Add a user-requested, one-shot animation to the current Three.js model.\n\n` +
    `Animation instruction: ${brief}\n\n` +
    `Use exactly ${duration} seconds as ANIMATION.duration (this is the shared clip length).\n\n` +
    `Current scene module:\n\`\`\`javascript\n${code}\n\`\`\`\n\n` +
    'The host keeps the base model immutable and stores your output as a duplicate ' +
    'animation clip — do not redesign the model; preserve geometry and PARAMS. ' +
    'Prefer ANIMATION.tracks on existing part keys. Insert a pivot/hinge only when ' +
    'correct joint motion requires it. Export ANIMATION with name + duration + tracks[]. ' +
    'Drive motion from time in updateScene (clamp, hold at end — do not loop). ' +
    'Do NOT set or change CAMERA. Only animate what the instruction asks for. ' +
    'Return the complete updated ```javascript block.'
  );
}

async function runAnimation(
  client: Anthropic,
  brief: string,
  code: string,
  duration: number,
): Promise<ModelCode> {
  return completeModule(client, loadSkill('threejs-animation'), animationPrompt(brief, code, duration));
}

// ─── Camera agent (composition) ──────────────────────────────────────────────

function compositionPrompt(brief: string, code: string, aspectRatio?: AspectRatio): string {
  const ratioLine = aspectRatio
    ? `Target preview aspect ratio: ${aspectRatio}. Use it when adjusting CAMERA / blocking.\n\n`
    : '';
  return (
    `${ratioLine}` +
    `Reframe / reblock the current Three.js model. Do not invent time-based animation and ` +
    `preserve any existing ANIMATION export unchanged.\n\n` +
    `Composition instruction: ${brief}\n\n` +
    `Current scene module:\n\`\`\`javascript\n${code}\n\`\`\`\n\n` +
    'Update CAMERA (position/lookAt/fov); change object placement only if required for the shot. ' +
    'Return the complete updated ```javascript block.'
  );
}

async function runComposition(
  client: Anthropic,
  brief: string,
  code: string,
  aspectRatio?: AspectRatio,
): Promise<ModelCode> {
  return completeModule(client, loadSkill('camera-composition'), compositionPrompt(brief, code, aspectRatio));
}

/**
 * Camera pass for a fused merge: the module is large and host-owned, so we only
 * ask for a CAMERA literal and splice it in deterministically — never letting
 * the LLM rewrite the fused wrapper or its stitched animation.
 */
async function runMergeCamera(
  client: Anthropic,
  brief: string,
  fusedCode: string,
  aspectRatio?: AspectRatio,
): Promise<string | null> {
  const ratioLine = aspectRatio ? `Target preview aspect ratio: ${aspectRatio}.\n\n` : '';
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `${ratioLine}Choose the camera for this multi-subject scene. Do NOT rewrite the module or its animation.\n\n` +
        `Composition instruction: ${brief}\n\n` +
        `Current fused scene module:\n\`\`\`javascript\n${fusedCode}\n\`\`\`\n\n` +
        'Return ONLY a single ```javascript block containing exactly one ' +
        '`export const CAMERA = { position: [x, y, z], lookAt: [x, y, z], fov: n };` and nothing else.',
    },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await complete(client, loadSkill('camera-composition'), messages);
    const text = textOf(response);
    const blocks = extractFencedBlocks(text);
    const js = blocks.find((block) => JS_LANGS.has(block.lang));
    const literal = js ? extractCameraLiteral(js.code) : null;
    if (literal) return literal;
    messages.push({ role: 'assistant', content: response.content as Anthropic.MessageParam['content'] });
    messages.push({
      role: 'user',
      content: 'Return a single ```javascript block with exactly `export const CAMERA = { ... };`.',
    });
  }
  return null;
}

// ─── Orchestration ───────────────────────────────────────────────────────────

export async function animateModel(
  client: Anthropic,
  prompt: string,
  code: string,
  options: AnimateOptions = {},
): Promise<ModelCode> {
  const { aspectRatio, children } = options;
  const isMerge = Array.isArray(children) && children.length >= 2;
  const subjects = isMerge
    ? children!.map((c) => ({ id: c.id, name: c.name }))
    : [{ id: SELF_SUBJECT_ID, name: 'the model' }];

  const plan = await planVideo(client, prompt, subjects);

  if (plan.mode === 'composition') {
    return runComposition(client, plan.cameraBrief ?? prompt, code, aspectRatio);
  }

  // Animation (and possibly camera): animate each subject in isolation.
  let animatedCode: string;
  if (isMerge) {
    const briefById = new Map(plan.subjects.map((s) => [s.id, s.brief]));
    const animatedChildren = await Promise.all(
      children!.map(async (child) => {
        const brief = (briefById.get(child.id) ?? '').trim();
        if (!brief) return { name: child.name, code: child.code };
        const res = await runAnimation(client, brief, child.code, plan.duration);
        return { name: child.name, code: res.code };
      }),
    );
    animatedCode = stitchMergeAnimation(animatedChildren, {
      name: plan.name,
      duration: plan.duration,
      previousFusedCode: code,
    });
  } else {
    const brief = plan.subjects[0]?.brief?.trim() || prompt;
    const res = await runAnimation(client, brief, code, plan.duration);
    animatedCode = res.code;
  }

  if (plan.mode === 'animation') {
    return { code: animatedCode };
  }

  // mode === 'both' → camera pass.
  const cameraBrief = plan.cameraBrief ?? prompt;
  if (isMerge) {
    const literal = await runMergeCamera(client, cameraBrief, animatedCode, aspectRatio);
    return { code: literal ? replaceCameraLiteral(animatedCode, literal) : animatedCode };
  }
  return runComposition(client, cameraBrief, animatedCode, aspectRatio);
}
