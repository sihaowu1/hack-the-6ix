import Anthropic from '@anthropic-ai/sdk';
import {
  fuseSlugs,
  parseAnimationTracks,
  patchParam,
  stitchMergeAnimation,
  validateSceneModule,
  type AspectRatio,
} from '@motionforge/shared';
import { config } from '../config';
import { loadSkill } from '../ai/skills';
import { extractFencedBlocks } from '../ai/extract';
import { logJson } from '../utils/logger';
import { verifyAnimatedModule, type AnimationIssue } from './verifyAnimation';

/**
 * Video agent: a small multi-agent pipeline.
 *
 *   Director (JSON plan) → N animation agents (one per subject, parallel)
 *     → deterministic stitch → verify + fix
 *
 * Framing is the user's live orbit in the editor — this agent never rewrites CAMERA.
 * Single models are the degenerate case: one subject ("self"), no stitch.
 * Merges send their pristine child modules so each subject is animated in
 * isolation, then re-fused deterministically (no LLM rewrites the wrapper).
 * Every stage logs structured records (see utils/logger.logJson).
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
const MAX_FIX_ATTEMPTS = 2;
const GAP_STEP = 1.5;

function makeRunId(): string {
  return Math.random().toString(36).slice(2, 10);
}

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
  runId: string,
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
  const plan = parsed ?? heuristicPlan(prompt, subjects);
  logJson(`animate:${runId}:director`, {
    runId,
    stage: 'director',
    fallback: parsed === null,
    mode: plan.mode,
    duration: plan.duration,
    name: plan.name,
    cameraBrief: plan.cameraBrief,
    subjects: plan.subjects.map((s) => ({ id: s.id, brief: s.brief })),
  });
  return plan;
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
  onReject?: (errors: string[], attempt: number) => void,
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
    onReject?.(errors, attempt);
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

function correctionNote(issues: string[]): string {
  return (
    `\n\nThe previous attempt was rejected by the host verifier for these problems — ` +
    `fix exactly these and change nothing else:\n` +
    issues.map((m) => `- ${m}`).join('\n')
  );
}

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
    'Keep every part resting at y >= 0 (do not sink through the floor). ' +
    'Do NOT set or change CAMERA. Only animate what the instruction asks for. ' +
    'Return the complete updated ```javascript block.'
  );
}

async function runAnimation(
  client: Anthropic,
  brief: string,
  code: string,
  duration: number,
  logCtx?: { runId: string; subject: string },
): Promise<ModelCode> {
  return completeModule(
    client,
    loadSkill('threejs-animation'),
    animationPrompt(brief, code, duration),
    logCtx
      ? (errors, attempt) =>
          logJson(`animate:${logCtx.runId}:animator`, {
            runId: logCtx.runId,
            stage: 'animator',
            subject: logCtx.subject,
            rejectedAttempt: attempt,
            validatorErrors: errors,
          })
      : undefined,
  );
}

// ─── Verify + fix ────────────────────────────────────────────────────────────

interface SingleFixContext {
  kind: 'single';
  brief: string;
}

interface MergeFixContext {
  kind: 'merge';
  children: AnimateChild[];
  animatedChildren: Array<{ name: string; code: string }>;
  slugs: string[];
  briefById: Map<string, string>;
  movingSlugs: string[];
  name: string;
  previousFusedCode: string;
}

type FixContext = SingleFixContext | MergeFixContext;

async function fixSingle(
  client: Anthropic,
  code: string,
  issues: AnimationIssue[],
  duration: number,
  ctx: SingleFixContext,
  runId: string,
): Promise<string> {
  const messages = issues.map((i) => i.message);
  const brief = ctx.brief + correctionNote(messages);
  const res = await completeModule(
    client,
    loadSkill('threejs-animation'),
    animationPrompt(brief, code, duration),
  );
  logJson(`animate:${runId}:fix`, {
    runId,
    stage: 'fix',
    target: 'single',
    fixedIssues: messages,
  });
  return res.code;
}

async function fixMerge(
  client: Anthropic,
  code: string,
  issues: AnimationIssue[],
  duration: number,
  ctx: MergeFixContext,
  gapBoost: number,
  runId: string,
): Promise<{ code: string; gapBoost: number }> {
  const perSubject = new Map<string, string[]>();
  const globalIssues: string[] = [];
  let interpenetration = false;

  for (const issue of issues) {
    if (issue.kind === 'interpenetration') {
      interpenetration = true;
      continue;
    }
    if (issue.subjectSlug) {
      const list = perSubject.get(issue.subjectSlug) ?? [];
      list.push(issue.message);
      perSubject.set(issue.subjectSlug, list);
    } else {
      globalIssues.push(issue.message);
    }
  }
  // Global (unattributable) issues apply to every moving subject.
  if (globalIssues.length > 0) {
    for (const slug of ctx.movingSlugs) {
      const list = perSubject.get(slug) ?? [];
      perSubject.set(slug, [...list, ...globalIssues]);
    }
  }

  // Re-animate affected children from their pristine modules, then re-stitch.
  let reanimated = false;
  for (const [slug, messages] of perSubject) {
    const idx = ctx.slugs.indexOf(slug);
    if (idx < 0) continue;
    const child = ctx.children[idx];
    const baseBrief = (ctx.briefById.get(child.id) ?? '').trim() || 'Animate this subject.';
    const res = await runAnimation(client, baseBrief + correctionNote(messages), child.code, duration, {
      runId,
      subject: slug,
    });
    ctx.animatedChildren[idx] = { name: child.name, code: res.code };
    reanimated = true;
    logJson(`animate:${runId}:fix`, {
      runId,
      stage: 'fix',
      target: 'merge-subject',
      subject: slug,
      fixedIssues: messages,
    });
  }

  let nextGap = gapBoost;
  if (interpenetration) {
    nextGap = gapBoost + GAP_STEP;
    logJson(`animate:${runId}:fix`, {
      runId,
      stage: 'fix',
      target: 'merge-placement',
      action: 'increase-mergeGap',
      gapBoost: nextGap,
    });
  }

  let next = reanimated
    ? stitchMergeAnimation(ctx.animatedChildren, {
        name: ctx.name,
        duration,
        previousFusedCode: ctx.previousFusedCode,
      })
    : code;
  // Re-stitch resets mergeGap to its default, so re-apply the accumulated boost.
  if (nextGap > 0) next = patchParam(next, 'mergeGap', 1 + nextGap);

  return { code: next, gapBoost: nextGap };
}

/**
 * Verify the animated module and fix problems, re-checking after each fix.
 * Returns the best code available; never throws (best-effort — showing motion
 * beats erroring out). Residual issues are logged.
 */
async function verifyAndFix(
  client: Anthropic,
  code: string,
  duration: number,
  ctx: FixContext,
  runId: string,
): Promise<string> {
  let current = code;
  let gapBoost = 0;
  const movingSlugs = ctx.kind === 'merge' ? ctx.movingSlugs : undefined;

  for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
    const issues = verifyAnimatedModule(current, { expectedDuration: duration, movingSlugs });
    logJson(`animate:${runId}:verify`, {
      runId,
      stage: 'verify',
      attempt,
      issueCount: issues.length,
      issues: issues.map((i) => ({ kind: i.kind, subject: i.subjectSlug, message: i.message })),
    });
    if (issues.length === 0) return current;
    if (attempt >= MAX_FIX_ATTEMPTS) {
      logJson(`animate:${runId}:verify`, {
        runId,
        stage: 'verify',
        residual: true,
        issues: issues.map((i) => ({ kind: i.kind, subject: i.subjectSlug, message: i.message })),
      });
      return current;
    }

    try {
      if (ctx.kind === 'single') {
        current = await fixSingle(client, current, issues, duration, ctx, runId);
      } else {
        const result = await fixMerge(client, current, issues, duration, ctx, gapBoost, runId);
        current = result.code;
        gapBoost = result.gapBoost;
      }
    } catch (err) {
      logJson(`animate:${runId}:fix`, {
        runId,
        stage: 'fix',
        error: err instanceof Error ? err.message : String(err),
      });
      return current;
    }
  }
  return current;
}

// ─── Orchestration ───────────────────────────────────────────────────────────

export async function animateModel(
  client: Anthropic,
  prompt: string,
  code: string,
  options: AnimateOptions = {},
): Promise<ModelCode> {
  const runId = makeRunId();
  const startedAt = Date.now();
  const { aspectRatio, children } = options;
  const isMerge = Array.isArray(children) && children.length >= 2;
  const subjects = isMerge
    ? children!.map((c) => ({ id: c.id, name: c.name }))
    : [{ id: SELF_SUBJECT_ID, name: 'the model' }];

  logJson(`animate:${runId}:start`, {
    runId,
    stage: 'start',
    isMerge,
    subjectCount: subjects.length,
    aspectRatio: aspectRatio ?? null,
  });

  const plan = await planVideo(client, prompt, subjects, runId);

  // Framing is the user's live orbit in the editor — never rewrite CAMERA.
  if (plan.mode === 'composition') {
    logJson(`animate:${runId}:done`, {
      runId,
      stage: 'done',
      mode: plan.mode,
      skipped: 'composition-uses-user-camera',
      elapsedMs: Date.now() - startedAt,
    });
    return { code };
  }

  // Animation: animate each subject in isolation.
  let animatedCode: string;
  let fixContext: FixContext;

  if (isMerge) {
    const briefById = new Map(plan.subjects.map((s) => [s.id, s.brief]));
    const slugs = fuseSlugs(children!.map((c) => c.name));
    const movingSlugs = children!
      .map((c, i) => ({ slug: slugs[i], brief: (briefById.get(c.id) ?? '').trim() }))
      .filter((s) => s.brief.length > 0)
      .map((s) => s.slug);

    const animatorStart = Date.now();
    const animatedChildren = await Promise.all(
      children!.map(async (child) => {
        const brief = (briefById.get(child.id) ?? '').trim();
        if (!brief) return { name: child.name, code: child.code };
        const res = await runAnimation(client, brief, child.code, plan.duration, {
          runId,
          subject: child.name,
        });
        return { name: child.name, code: res.code };
      }),
    );
    animatedCode = stitchMergeAnimation(animatedChildren, {
      name: plan.name,
      duration: plan.duration,
      previousFusedCode: code,
    });
    logJson(`animate:${runId}:stitch`, {
      runId,
      stage: 'stitch',
      elapsedMs: Date.now() - animatorStart,
      subjects: animatedChildren.map((c, i) => ({
        slug: slugs[i],
        moving: movingSlugs.includes(slugs[i]),
        trackCount: parseAnimationTracks(c.code).length,
      })),
    });

    fixContext = {
      kind: 'merge',
      children: children!,
      animatedChildren,
      slugs,
      briefById,
      movingSlugs,
      name: plan.name,
      previousFusedCode: code,
    };
  } else {
    const brief = plan.subjects[0]?.brief?.trim() || prompt;
    const res = await runAnimation(client, brief, code, plan.duration, { runId, subject: 'the model' });
    animatedCode = res.code;
    fixContext = { kind: 'single', brief };
  }

  animatedCode = await verifyAndFix(client, animatedCode, plan.duration, fixContext, runId);

  logJson(`animate:${runId}:done`, {
    runId,
    stage: 'done',
    mode: plan.mode === 'both' ? 'animation' : plan.mode,
    skippedCamera: plan.mode === 'both',
    elapsedMs: Date.now() - startedAt,
  });
  return { code: animatedCode };
}
