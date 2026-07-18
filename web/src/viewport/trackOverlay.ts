import type { AnimationKeyframe, AnimationTrack } from '@motionforge/shared';

/** One sampled track to apply on top of updateScene during multi-clip playback. */
export interface TrackOverlay {
  part: string;
  channel: AnimationTrack['channel'];
  axis?: 'x' | 'y' | 'z';
  keyframes: AnimationKeyframe[];
  /** Local time within the clip (seconds). */
  localTime: number;
}

function sampleKeyframes(keyframes: AnimationKeyframe[], t: number): number {
  if (keyframes.length === 0) return 0;
  if (t <= keyframes[0].t) return keyframes[0].v;
  const last = keyframes[keyframes.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t || 1);
      return a.v + (b.v - a.v) * f;
    }
  }
  return last.v;
}

/**
 * Apply host-side track overlays onto a buildScene object map. Used when
 * multiple independently scheduled part clips overlap on the timeline.
 */
export function applyTrackOverlays(
  objects: unknown,
  overlays: TrackOverlay[],
): void {
  if (!objects || typeof objects !== 'object') return;
  const map = objects as Record<string, { rotation?: Record<string, number>; position?: Record<string, number>; scale?: Record<string, number> }>;
  for (const overlay of overlays) {
    const part = map[overlay.part];
    if (!part) continue;
    const v = sampleKeyframes(overlay.keyframes, overlay.localTime);
    const axis = overlay.axis ?? 'x';
    if (overlay.channel === 'rotation' && part.rotation) part.rotation[axis] = v;
    else if (overlay.channel === 'position' && part.position) part.position[axis] = v;
    else if (overlay.channel === 'scale' && part.scale) part.scale[axis] = v;
  }
}
