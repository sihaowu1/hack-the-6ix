import { parseAnimationTracks } from './animation';
import { fuseSceneModules, fuseSlugs, type FuseModuleInput } from './fuseModules';
import { parseTunables } from './tunables';
import type { AnimationTrack } from './types';

/**
 * Deterministic host-side stitching for the multi-agent video pipeline.
 *
 * Each subject (merge child) is animated independently by its own animation
 * agent, producing a self-contained module with its own `ANIMATION` clip and
 * time-driven `updateScene`. These animated child modules are re-fused into one
 * scene module — the fused `updateScene` already forwards `time` into each
 * child, so every child plays its clip in place. A parent `ANIMATION` export is
 * then injected purely as metadata (namespaced `slug_part` tracks) so the host
 * timeline, duration/name parsing, and overlays keep working. No LLM rewrites
 * the fused wrapper.
 */

export interface StitchChildInput {
  name: string;
  /** Animated (or pristine, if unanimated) child module source. */
  code: string;
}

export interface StitchOptions {
  /** Clip id/name stored on the parent ANIMATION export. */
  name: string;
  /** Shared playout duration in seconds for all subjects. */
  duration: number;
  /** Existing fused module source, used to preserve placement PARAMS. */
  previousFusedCode?: string;
}

type Placement = Pick<FuseModuleInput, 'offsetX' | 'offsetY' | 'offsetZ' | 'yaw'>;

/** Read per-child placement overrides from an existing fused module. */
function readPlacement(fusedCode: string, slug: string): Placement {
  const out: Placement = {};
  try {
    for (const t of parseTunables(fusedCode)) {
      if (t.type !== 'number' || typeof t.value !== 'number') continue;
      if (t.name === `${slug}_offsetX`) out.offsetX = t.value;
      else if (t.name === `${slug}_offsetY`) out.offsetY = t.value;
      else if (t.name === `${slug}_offsetZ`) out.offsetZ = t.value;
      else if (t.name === `${slug}_yaw`) out.yaw = t.value;
    }
  } catch {
    // ignore parse failures — fall back to default placement
  }
  return out;
}

function serializeKeyframes(keyframes: AnimationTrack['keyframes']): string {
  return keyframes.map((k) => `{ t: ${k.t}, v: ${k.v} }`).join(', ');
}

function serializeTrack(track: AnimationTrack): string {
  const axis = track.axis ? `, axis: ${JSON.stringify(track.axis)}` : '';
  return (
    `    { part: ${JSON.stringify(track.part)}, channel: ${JSON.stringify(track.channel)}` +
    `${axis}, keyframes: [ ${serializeKeyframes(track.keyframes)} ] }`
  );
}

/** Build a parent `export const ANIMATION = { ... }` block (metadata only). */
function buildAnimationExport(name: string, duration: number, tracks: AnimationTrack[]): string {
  const body = tracks.map(serializeTrack).join(',\n');
  const tracksLiteral = tracks.length > 0 ? `\n${body}\n  ` : '';
  return (
    `export const ANIMATION = {\n` +
    `  name: ${JSON.stringify(name)},\n` +
    `  duration: ${duration},\n` +
    `  tracks: [${tracksLiteral}],\n` +
    `};`
  );
}

/**
 * Re-fuse animated child modules into one scene module and inject a parent
 * ANIMATION export with namespaced tracks. Requires at least two children.
 */
export function stitchMergeAnimation(children: StitchChildInput[], options: StitchOptions): string {
  if (children.length < 2) {
    throw new Error('stitchMergeAnimation requires at least two children');
  }
  const slugs = fuseSlugs(children.map((c) => c.name));
  const inputs: FuseModuleInput[] = children.map((child, i) => ({
    name: child.name,
    code: child.code,
    ...(options.previousFusedCode ? readPlacement(options.previousFusedCode, slugs[i]) : {}),
  }));
  const fused = fuseSceneModules(inputs);

  const tracks: AnimationTrack[] = [];
  children.forEach((child, i) => {
    const slug = slugs[i];
    for (const track of parseAnimationTracks(child.code)) {
      tracks.push({ ...track, part: `${slug}_${track.part}` });
    }
  });

  const animExport = buildAnimationExport(options.name, options.duration, tracks);
  const marker = '\nconst __CHILDREN';
  if (fused.includes(marker)) {
    return fused.replace(marker, `\n${animExport}\n${marker}`);
  }
  return `${fused}\n\n${animExport}\n`;
}

// ─── CAMERA splicing ─────────────────────────────────────────────────────────

/** Balanced-brace bounds of `export const <name> = { ... }` in source. */
function balancedObjectRange(code: string, exportName: string): { start: number; end: number } | null {
  const re = new RegExp(`export\\s+const\\s+${exportName}\\s*=\\s*\\{`);
  const match = re.exec(code);
  if (!match || match.index === undefined) return null;
  const braceStart = match.index + match[0].length - 1;
  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    const ch = code[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { start: braceStart, end: i + 1 };
    }
  }
  return null;
}

/** Extract the `{ ... }` object literal text of the CAMERA export, if present. */
export function extractCameraLiteral(code: string): string | null {
  const range = balancedObjectRange(code, 'CAMERA');
  return range ? code.slice(range.start, range.end) : null;
}

/**
 * Replace the CAMERA object literal in `code` with `literal`. When `code` has
 * no CAMERA export the source is returned unchanged (fused output always has
 * one, so this is a safe splice for the merge camera pass).
 */
export function replaceCameraLiteral(code: string, literal: string): string {
  const range = balancedObjectRange(code, 'CAMERA');
  if (!range) return code;
  return code.slice(0, range.start) + literal + code.slice(range.end);
}
