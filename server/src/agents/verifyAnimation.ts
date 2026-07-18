import * as THREE from 'three';
import { checkAnimationClipStatic, parseAnimationDuration, parseAnimationTracks } from '@motionforge/shared';

/**
 * Headless animation verifier. Executes a generated scene module with real
 * three.js (no WebGLRenderer — only buildScene/updateScene + Box3 math) and
 * samples it across the clip to check the animation "mathematically works":
 * finite transforms, subjects resting on the floor, subjects not driving through
 * each other, motion actually happening, the final pose holding (no loop), and
 * nothing flying off. Static keyframe/part checks run too (and are the only
 * checks if execution fails, so obvious keyframe bugs are still caught).
 *
 * Safe to run server-side: the module contract forbids import/require/fetch
 * (enforced by validateSceneModule before we get here), and the same code
 * already executes in the browser runtime and the deterministic fuse.
 */

export interface AnimationIssue {
  /** Merge subject slug the issue belongs to, when attributable. */
  subjectSlug?: string;
  kind: string;
  message: string;
}

export interface VerifyOptions {
  /** Shared clip length the director asked every subject to use. */
  expectedDuration?: number;
  /**
   * For merges: slugs of subjects that were given a non-empty animation brief
   * (so they are expected to move). Omit for single models — the whole scene is
   * then treated as one subject that is expected to move.
   */
  movingSlugs?: string[];
}

// Tuned conservatively to avoid false positives on intentional contact.
const SAMPLES = 24;
const GROUND_EPS = 0.05;
const OVERLAP_FRACTION = 0.15;
const FLY_AWAY_DISTANCE = 50;
const SIZE_BLOWUP_FACTOR = 20;
const MOTION_EPS = 1e-3;
const HOLD_EPS = 1e-2;

interface LoadedModule {
  PARAMS: Record<string, unknown>;
  buildScene?: (ctx: unknown) => unknown;
  updateScene?: (ctx: unknown) => void;
}

interface Subject {
  slug?: string;
  root: THREE.Object3D;
  expectedToMove: boolean;
  watched: THREE.Object3D[];
}

/** Mirror the browser runtime's safeguard so missing params don't throw/NaN. */
function safeguardParams(params: Record<string, unknown>): Record<string, unknown> {
  return new Proxy(params, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (value === undefined || value === null) return 0;
      if (typeof value === 'number' && !Number.isFinite(value)) return 0;
      return value;
    },
  });
}

/** Load a module string the same way the deterministic fuse loads a child. */
function loadModule(code: string): LoadedModule {
  const rewritten = code
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/export\s+function\s+/g, 'function ')
    .replace(/export\s+\{[^}]*\};?/g, '');
  const runner = new Function(
    'THREE',
    `${rewritten}\n; return {` +
      ' PARAMS: typeof PARAMS !== "undefined" ? PARAMS : {},' +
      ' buildScene: typeof buildScene === "function" ? buildScene : null,' +
      ' updateScene: typeof updateScene === "function" ? updateScene : null' +
      ' };',
  );
  return runner(THREE) as LoadedModule;
}

/** Non-looping clamp semantics for lookups; verify uses raw seconds directly. */
function sampleTimes(duration: number): number[] {
  const times: number[] = [];
  for (let i = 0; i < SAMPLES; i++) times.push((duration * i) / (SAMPLES - 1));
  times.push(duration * 1.5); // hold check: pose past the end must equal the end
  return times;
}

function boxVolume(box: THREE.Box3): number {
  if (box.isEmpty()) return 0;
  const s = new THREE.Vector3();
  box.getSize(s);
  return Math.max(0, s.x) * Math.max(0, s.y) * Math.max(0, s.z);
}

function overlapVolume(a: THREE.Box3, b: THREE.Box3): number {
  if (a.isEmpty() || b.isEmpty()) return 0;
  const ox = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
  const oy = Math.max(0, Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y));
  const oz = Math.max(0, Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z));
  return ox * oy * oz;
}

function boxFinite(box: THREE.Box3): boolean {
  if (box.isEmpty()) return true;
  return (
    Number.isFinite(box.min.x) &&
    Number.isFinite(box.min.y) &&
    Number.isFinite(box.min.z) &&
    Number.isFinite(box.max.x) &&
    Number.isFinite(box.max.y) &&
    Number.isFinite(box.max.z)
  );
}

/** Snapshot a subject's watched local transforms into a flat number array. */
function watchedSnapshot(watched: THREE.Object3D[]): number[] {
  const out: number[] = [];
  for (const obj of watched) {
    out.push(
      obj.position.x, obj.position.y, obj.position.z,
      obj.rotation.x, obj.rotation.y, obj.rotation.z,
      obj.scale.x, obj.scale.y, obj.scale.z,
    );
  }
  return out;
}

function maxAbsDelta(a: number[], b: number[]): number {
  let max = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}

/** Determine which slug a namespaced track part belongs to. */
function slugForPart(part: string, slugs: string[]): string | undefined {
  return slugs.find((slug) => part === `${slug}_root` || part.startsWith(`${slug}_`));
}

function scanDeterminism(code: string): AnimationIssue[] {
  const issues: AnimationIssue[] = [];
  const banned: Array<[RegExp, string]> = [
    [/Math\.random\s*\(/, 'Math.random()'],
    [/\bDate\.now\s*\(/, 'Date.now()'],
    [/new\s+Date\s*\(/, 'new Date()'],
    [/performance\.now\s*\(/, 'performance.now()'],
  ];
  for (const [re, label] of banned) {
    if (re.test(code)) {
      issues.push({
        kind: 'determinism',
        message: `module uses ${label}, which breaks deterministic frame-independent rendering`,
      });
    }
  }
  return issues;
}

/**
 * Verify an animated (single or stitched-merge) module. Returns a list of
 * concrete problems; an empty list means the animation checks out.
 */
export function verifyAnimatedModule(code: string, opts: VerifyOptions = {}): AnimationIssue[] {
  const issues: AnimationIssue[] = [];
  const duration = parseAnimationDuration(code) ?? opts.expectedDuration ?? 3;

  // Static + determinism checks always run (and are the fallback if exec fails).
  for (const msg of checkAnimationClipStatic(code, opts.expectedDuration)) {
    issues.push({ kind: 'static', message: msg });
  }
  issues.push(...scanDeterminism(code));

  let mod: LoadedModule;
  let scene: THREE.Scene;
  let objects: Record<string, unknown>;
  try {
    mod = loadModule(code);
    if (!mod.buildScene || !mod.updateScene) {
      return issues; // static checks already flag a broken contract shape
    }
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    objects = (mod.buildScene({
      THREE,
      scene,
      params: safeguardParams(mod.PARAMS),
    }) ?? {}) as Record<string, unknown>;
  } catch (err) {
    issues.push({
      kind: 'runtime-error',
      message: `buildScene threw during verification: ${err instanceof Error ? err.message : String(err)}`,
    });
    return issues;
  }

  // Resolve subjects.
  const mergeEntries = Array.isArray((objects as { __merge?: unknown }).__merge)
    ? ((objects as { __merge: Array<{ group?: THREE.Object3D; slug?: string }> }).__merge)
    : null;
  const slugs = mergeEntries
    ? mergeEntries.map((e) => e.slug).filter((s): s is string => typeof s === 'string')
    : [];

  const tracks = parseAnimationTracks(code);

  // Part-existence check (runtime object map is authoritative).
  for (const track of tracks) {
    if (!(track.part in objects) || objects[track.part] == null) {
      issues.push({
        kind: 'missing-part',
        subjectSlug: slugForPart(track.part, slugs),
        message: `ANIMATION track targets "${track.part}", which is not a key returned by buildScene`,
      });
    }
  }

  const subjects: Subject[] = [];
  if (mergeEntries) {
    for (const entry of mergeEntries) {
      if (!entry?.group || !entry.slug) continue;
      const slug = entry.slug;
      const watched = tracks
        .filter((t) => slugForPart(t.part, slugs) === slug)
        .map((t) => objects[t.part])
        .filter((o): o is THREE.Object3D => o instanceof THREE.Object3D);
      subjects.push({
        slug,
        root: entry.group,
        expectedToMove: opts.movingSlugs ? opts.movingSlugs.includes(slug) : true,
        watched,
      });
    }
  } else {
    const watched = tracks
      .map((t) => objects[t.part])
      .filter((o): o is THREE.Object3D => o instanceof THREE.Object3D);
    subjects.push({ slug: undefined, root: scene, expectedToMove: true, watched });
  }

  // Sample the timeline.
  const times = sampleTimes(duration);
  const boxesPerSubject: THREE.Box3[][] = subjects.map(() => []);
  const watchedPerSubject: number[][][] = subjects.map(() => []);
  let updateThrew: string | null = null;

  for (const time of times) {
    try {
      mod.updateScene({
        THREE,
        scene,
        objects,
        params: safeguardParams(mod.PARAMS),
        time,
      });
    } catch (err) {
      updateThrew = err instanceof Error ? err.message : String(err);
      break;
    }
    scene.updateMatrixWorld(true);
    for (let i = 0; i < subjects.length; i++) {
      const box = new THREE.Box3().setFromObject(subjects[i].root);
      boxesPerSubject[i].push(box);
      watchedPerSubject[i].push(watchedSnapshot(subjects[i].watched));
    }
  }

  if (updateThrew) {
    issues.push({
      kind: 'runtime-error',
      message: `updateScene threw during verification: ${updateThrew}`,
    });
    return issues;
  }

  const holdIndex = times.length - 1; // the 1.5*duration sample
  const endIndex = SAMPLES - 1; // the exact t=duration sample

  for (let i = 0; i < subjects.length; i++) {
    const subject = subjects[i];
    const boxes = boxesPerSubject[i];
    const snaps = watchedPerSubject[i];
    if (boxes.length === 0) continue;

    const baseBox = boxes[0];
    const baseVol = boxVolume(baseBox);
    let minY = Infinity;
    let flewAway = false;
    let blewUp = false;
    let hasNaN = false;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();

    for (const box of boxes) {
      if (!boxFinite(box)) hasNaN = true;
      if (box.isEmpty()) continue;
      if (box.min.y < minY) minY = box.min.y;
      box.getCenter(center);
      if (center.length() > FLY_AWAY_DISTANCE) flewAway = true;
      box.getSize(size);
      if (baseVol > 1e-6 && boxVolume(box) > baseVol * SIZE_BLOWUP_FACTOR) blewUp = true;
    }

    if (hasNaN) {
      issues.push({
        kind: 'nan',
        subjectSlug: subject.slug,
        message: `${subjectLabel(subject)} produces a non-finite (NaN) transform during the clip`,
      });
    }
    if (Number.isFinite(minY) && minY < -GROUND_EPS) {
      issues.push({
        kind: 'ground',
        subjectSlug: subject.slug,
        message: `${subjectLabel(subject)} sinks below the floor (lowest y = ${minY.toFixed(2)}); keep its base at y >= 0`,
      });
    }
    if (flewAway) {
      issues.push({
        kind: 'fly-away',
        subjectSlug: subject.slug,
        message: `${subjectLabel(subject)} travels implausibly far from the origin (> ${FLY_AWAY_DISTANCE} units)`,
      });
    }
    if (blewUp) {
      issues.push({
        kind: 'scale-blowup',
        subjectSlug: subject.slug,
        message: `${subjectLabel(subject)} grows more than ${SIZE_BLOWUP_FACTOR}x its starting size`,
      });
    }

    // Motion: expected-to-move subjects must actually change.
    if (subject.expectedToMove) {
      if (subject.watched.length === 0) {
        issues.push({
          kind: 'no-motion',
          subjectSlug: subject.slug,
          message: `${subjectLabel(subject)} was asked to move but has no ANIMATION tracks targeting its parts`,
        });
      } else {
        let maxDelta = 0;
        for (const snap of snaps) maxDelta = Math.max(maxDelta, maxAbsDelta(snaps[0], snap));
        if (maxDelta < MOTION_EPS) {
          issues.push({
            kind: 'no-motion',
            subjectSlug: subject.slug,
            message: `${subjectLabel(subject)} was asked to move but its tracked parts never change`,
          });
        }
      }
    }

    // Hold: pose at 1.5*duration must equal pose at duration (no loop/reset).
    if (subject.watched.length > 0 && snaps[endIndex] && snaps[holdIndex]) {
      if (maxAbsDelta(snaps[endIndex], snaps[holdIndex]) > HOLD_EPS) {
        issues.push({
          kind: 'no-hold',
          subjectSlug: subject.slug,
          message: `${subjectLabel(subject)} does not hold its final pose after the clip ends (it loops or keeps moving)`,
        });
      }
    }
  }

  // Interpenetration: pairwise, only when overlap grows past the t=0 baseline.
  for (let a = 0; a < subjects.length; a++) {
    for (let b = a + 1; b < subjects.length; b++) {
      const boxesA = boxesPerSubject[a];
      const boxesB = boxesPerSubject[b];
      if (boxesA.length === 0 || boxesB.length === 0) continue;
      const baseOverlap = overlapVolume(boxesA[0], boxesB[0]);
      const smallerVol = Math.min(boxVolume(boxesA[0]), boxVolume(boxesB[0]));
      if (smallerVol < 1e-6) continue;
      let worst = 0;
      const frames = Math.min(boxesA.length, boxesB.length);
      for (let f = 0; f < frames; f++) {
        worst = Math.max(worst, overlapVolume(boxesA[f], boxesB[f]) - baseOverlap);
      }
      if (worst > OVERLAP_FRACTION * smallerVol) {
        issues.push({
          kind: 'interpenetration',
          message: `subjects "${subjects[a].slug}" and "${subjects[b].slug}" drive into each other during the clip (overlap grows well past their resting contact)`,
        });
      }
    }
  }

  return issues;
}

function subjectLabel(subject: Subject): string {
  return subject.slug ? `subject "${subject.slug}"` : 'the model';
}
