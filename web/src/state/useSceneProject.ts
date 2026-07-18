import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_SCENE_CODE,
  deleteLayer as deleteLayerInCode,
  fuseSceneModules,
  parseAnimationDuration,
  parseAnimationName,
  parseAnimationPartNames,
  parseAnimationTracks,
  parseTunables,
  patchParam,
  renameLayer as renameLayerInCode,
  type AspectRatio,
  type ReferenceImage,
  type RenderSettings,
} from '@motionforge/shared';
import * as api from '../api/client';
import {
  deriveTimelineTotal,
  MIN_CLIP_DURATION,
  type TimelineClip,
  type TimelineLane,
} from '../components/timeline/timelineMath';
import { useTimelinePlayback } from '../components/timeline/useTimelinePlayback';
import type { TrackOverlay } from '../viewport/trackOverlay';

/**
 * All editor state in one hook.
 *
 * Each model may hold one animation duplicate (`animation`) so motion never
 * mutates the frozen base `code`. Merges are real fused modules (`code` is one
 * scene on a shared plane); `childIds` remain for hierarchy UI.
 */

export interface Status {
  kind: 'info' | 'error';
  text: string;
}

export interface Mp4JobState {
  id: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  message: string;
  url?: string;
  error?: string;
}

/** One animated duplicate of a model's base module (does not mutate `code`). */
export interface AnimationInstance {
  id: string;
  name: string;
  duration: number;
  code: string;
  parts: string[];
  createdAt: number;
}

/** A single generated model: source of truth for both editors, viewport, and Materials pane. */
export interface SceneModel {
  id: string;
  name: string;
  code: string;
  createdAt: number;
  /**
   * When set, this row is a merge of other models. `code` is the real fused
   * module (animatable); `childIds` are kept for hierarchy UI.
   */
  childIds?: string[];
  /**
   * The one animated duplicate for this model. Regenerating replaces it;
   * the base `code` stays frozen.
   */
  animation?: AnimationInstance;
}

/** A timeline clip on a hierarchical part lane. */
export interface Clip {
  id: string;
  modelId: string;
  animationId: string;
  part: string;
  label: string;
  /** Seconds from t=0 on the timeline. */
  start: number;
  /** Length of the clip in seconds. */
  duration: number;
}

const DEFAULT_MODEL_ID = 'default';
const WHOLE_PART = '__whole__';

function makeDefaultModel(): SceneModel {
  return {
    id: DEFAULT_MODEL_ID,
    name: 'Default model',
    code: DEFAULT_SCENE_CODE,
    createdAt: Date.now(),
  };
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Derive a short display name from a generation prompt. */
function nameFromPrompt(prompt: string, fallbackIndex: number): string {
  const trimmed = prompt.trim();
  if (!trimmed) return `Model ${fallbackIndex}`;
  const first = trimmed.split(/\s+/).slice(0, 6).join(' ');
  return first.length > 42 ? `${first.slice(0, 42)}…` : first;
}

/** Animate always targets the Materials selection (`activeModelId`). */
function resolveModelForAnimation(
  models: SceneModel[],
  activeModelId: string,
): SceneModel | undefined {
  return models.find((m) => m.id === activeModelId) ?? models[0];
}

function clipsOverlap(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur && aStart + aDur > bStart;
}

export function useSceneProject() {
  const [models, setModels] = useState<SceneModel[]>(() => [makeDefaultModel()]);
  const [activeModelId, setActiveModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([DEFAULT_MODEL_ID]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipboardClip, setClipboardClip] = useState<Clip | null>(null);
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(() => new Set());
  const [timelineFocusModelId, setTimelineFocusModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [mp4Job, setMp4Job] = useState<Mp4JobState | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(DEFAULT_ASPECT_RATIO);
  const pollRef = useRef<number | null>(null);

  const activeModel = useMemo(
    () => models.find((m) => m.id === activeModelId) ?? models[0],
    [models, activeModelId],
  );
  const code = activeModel.code;

  /** Merges resolve to child scene entries for co-view placement. */
  const viewportScenes = useMemo(
    () => resolveViewportScenes(activeModel, models),
    [activeModel, models],
  );

  const tunables = useMemo(() => {
    try {
      return parseTunables(code);
    } catch {
      return [];
    }
  }, [code]);

  const timelineLanes = useMemo(
    () => buildTimelineLanes(models, clips),
    [models, clips],
  );

  const focusedTimelineLanes = useMemo(() => {
    const focusId = timelineFocusModelId || activeModelId;
    return timelineLanes.filter((lane) => lane.modelId === focusId);
  }, [timelineLanes, timelineFocusModelId, activeModelId]);

  const visibleLanes = useMemo(() => {
    return focusedTimelineLanes.filter((lane) => {
      if (!lane.parentId) return true;
      let parentId: string | undefined = lane.parentId;
      while (parentId) {
        if (collapsedLanes.has(parentId)) return false;
        const parent = focusedTimelineLanes.find((l) => l.id === parentId);
        parentId = parent?.parentId;
      }
      return true;
    });
  }, [focusedTimelineLanes, collapsedLanes]);

  const timelineClips = useMemo<TimelineClip[]>(() => {
    const focusId = timelineFocusModelId || activeModelId;
    return clips
      .filter((c) => c.modelId === focusId)
      .map((c) => ({
        id: c.id,
        label: c.label,
        start: c.start,
        duration: c.duration,
        // One track per model (or merge parent); no per-part lanes.
        laneId: c.modelId,
      }));
  }, [clips, timelineFocusModelId, activeModelId]);
  const timelineTotal = useMemo(() => deriveTimelineTotal(timelineClips), [timelineClips]);
  const playback = useTimelinePlayback(timelineTotal);

  const activeClips = useMemo(
    () =>
      clips.filter(
        (c) => playback.currentTime >= c.start && playback.currentTime < c.start + c.duration,
      ),
    [clips, playback.currentTime],
  );

  const previewModel = useMemo(() => {
    if (activeClips.length === 0) return activeModel;
    const modelId = activeClips[0].modelId;
    return models.find((m) => m.id === modelId) ?? activeModel;
  }, [activeClips, activeModel, models]);

  const previewScenes = useMemo(() => {
    // When a timeline clip is active we drive preview from the animation
    // module via `previewCode` alone — don't co-view the frozen base model.
    if (activeClips.length > 0) return [];
    return resolveViewportScenes(previewModel, models);
  }, [activeClips.length, previewModel, models]);

  const { previewCode, previewTime, previewTrackOverlays } = useMemo(() => {
    if (activeClips.length === 0) {
      return {
        previewCode: previewModel.code,
        previewTime: 0,
        previewTrackOverlays: [] as TrackOverlay[],
      };
    }

    // Prefer playing the saved animation module itself (duplicate with motion).
    // Track overlays on the frozen base model often no-op when the AI inserted
    // pivots or renamed parts only in the animation duplicate.
    const primary = activeClips[0];
    const primaryModel = models.find((m) => m.id === primary.modelId);
    const primaryAnim =
      primaryModel?.animation?.id === primary.animationId ? primaryModel.animation : undefined;
    if (primaryAnim) {
      return {
        previewCode: primaryAnim.code,
        previewTime: Math.max(0, playback.currentTime - primary.start),
        previewTrackOverlays: [] as TrackOverlay[],
      };
    }

    // Fallback: host-side overlays when the animation instance is missing.
    const overlays: TrackOverlay[] = [];
    for (const clip of activeClips) {
      const model = models.find((m) => m.id === clip.modelId);
      const anim = model?.animation?.id === clip.animationId ? model.animation : undefined;
      if (!anim) continue;
      const localTime = playback.currentTime - clip.start;
      const tracks = parseAnimationTracks(anim.code).filter(
        (t) => clip.part === WHOLE_PART || t.part === clip.part,
      );
      for (const track of tracks) {
        overlays.push({
          part: track.part,
          channel: track.channel,
          axis: track.axis,
          keyframes: track.keyframes,
          localTime,
        });
      }
    }

    return {
      previewCode: previewModel.code,
      previewTime: 0,
      previewTrackOverlays: overlays,
    };
  }, [activeClips, models, playback.currentTime, previewModel]);

  const previewModelName = previewModel.name;

  useEffect(
    () => () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    },
    [],
  );

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setStatus(null);
    try {
      await fn();
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }, []);

  const setCode: Dispatch<SetStateAction<string>> = useCallback(
    (next) => {
      setModels((current) =>
        current.map((m) => {
          if (m.id !== activeModelId) return m;
          const value = typeof next === 'function' ? (next as (prev: string) => string)(m.code) : next;
          return { ...m, code: value };
        }),
      );
    },
    [activeModelId],
  );

  const generate = useCallback(
    (prompt: string, image?: ReferenceImage) =>
      run('Generating model…', async () => {
        const result = await api.generate(prompt, image);
        const id = makeId();
        setModels((current) => [
          ...current,
          {
            id,
            name: nameFromPrompt(prompt, current.length + 1),
            code: result.code,
            createdAt: Date.now(),
          },
        ]);
        setActiveModelId(id);
        setSelectedModelIds([id]);
        setSelectedLayer(null);
        setTimelineFocusModelId(id);
        setStatus({
          kind: 'info',
          text:
            result.source === 'template'
              ? 'Generated with the offline template (set OPENROUTER_API_KEY for AI generation).'
              : 'Model generated by the AI agent.',
        });
      }),
    [run],
  );

  const modify = useCallback(
    (prompt: string, image?: ReferenceImage) =>
      run('Modifying model…', async () => {
        const result = await api.modify(prompt, code, image);
        setModels((current) =>
          current.map((m) =>
            m.id === activeModelId
              ? {
                  ...m,
                  code: result.code,
                }
              : m,
          ),
        );
        setStatus({ kind: 'info', text: 'Model modified by the AI agent.' });
      }),
    [run, code, activeModelId],
  );

  /**
   * Video-screen Generate: animate/compose the Materials-selected model.
   * Writes a duplicated animated module to `animation`; never mutates
   * the base `model.code` (Model-screen source stays frozen). Regenerating
   * replaces the single animation for that model.
   */
  const animate = useCallback(
    (prompt: string) =>
      run('Animating…', async () => {
        const target = resolveModelForAnimation(models, activeModelId);
        if (!target) {
          throw new Error('No model available to animate. Generate a model on the Model screen first.');
        }

        const focused =
          selectedLayer && activeModelId === target.id
            ? `${prompt}\n\nFocus on part/layer: ${selectedLayer}.`
            : prompt;

        // Always animate from the pristine base module (including fused merges).
        const result = await api.animate(focused, target.code, aspectRatio);
        const duration = parseAnimationDuration(result.code) ?? 3;
        const name = parseAnimationName(result.code) ?? nameFromPrompt(prompt, 1);
        const parts = parseAnimationPartNames(result.code);
        const partList =
          parts.length > 0
            ? parts
            : selectedLayer
              ? [selectedLayer]
              : [WHOLE_PART];

        const animationId = makeId();
        const instance: AnimationInstance = {
          id: animationId,
          name,
          duration,
          code: result.code,
          parts: partList,
          createdAt: Date.now(),
        };

        setModels((current) =>
          current.map((m) => (m.id === target.id ? { ...m, animation: instance } : m)),
        );
        setActiveModelId(target.id);
        setSelectedModelIds([target.id]);
        setTimelineFocusModelId(target.id);

        setClips((current) => {
          const withoutModel = current.filter((c) => c.modelId !== target.id);
          const start =
            withoutModel.length === 0
              ? 0
              : Math.ceil(Math.max(...withoutModel.map((c) => c.start + c.duration)));
          return [
            ...withoutModel,
            {
              id: makeId(),
              modelId: target.id,
              animationId,
              part: WHOLE_PART,
              label: name,
              start,
              duration,
            },
          ].sort((a, b) => a.start - b.start || a.part.localeCompare(b.part));
        });

        setStatus({
          kind: 'info',
          text: `Animated “${target.name}” (${duration.toFixed(duration % 1 === 0 ? 0 : 1)}s) — base model unchanged.`,
        });
      }),
    [run, models, activeModelId, aspectRatio, selectedLayer],
  );

  const setParam = useCallback(
    (name: string, value: number | boolean | string) => {
      setCode((current) => patchParam(current, name, value));
    },
    [setCode],
  );

  const setActiveModel = useCallback((id: string) => {
    setActiveModelId(id);
    setSelectedModelIds([id]);
    setSelectedLayer(null);
    setTimelineFocusModelId(id);
  }, []);

  const selectModel = useCallback((id: string, options?: { shiftKey?: boolean }) => {
    if (options?.shiftKey) {
      setSelectedModelIds((current) => {
        if (current.includes(id)) {
          if (current.length <= 1) return current;
          return current.filter((entry) => entry !== id);
        }
        return [...current, id];
      });
      setActiveModelId(id);
      setSelectedLayer(null);
      setTimelineFocusModelId(id);
      return;
    }
    setActiveModelId(id);
    setSelectedModelIds([id]);
    setSelectedLayer(null);
    setTimelineFocusModelId(id);
  }, []);

  const selectLayer = useCallback((modelId: string, layerName: string) => {
    setActiveModelId(modelId);
    setSelectedModelIds([modelId]);
    setSelectedLayer(layerName);
    setTimelineFocusModelId(modelId);
  }, []);

  const renameModel = useCallback((modelId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setModels((current) =>
      current.map((m) => (m.id === modelId && m.name !== trimmed ? { ...m, name: trimmed } : m)),
    );
  }, []);

  const renameModelLayer = useCallback((modelId: string, oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setModels((current) =>
      current.map((m) => {
        if (m.id !== modelId) return m;
        const nextCode = renameLayerInCode(m.code, oldName, trimmed);
        return nextCode === m.code ? m : { ...m, code: nextCode };
      }),
    );
    setClips((current) =>
      current.map((c) =>
        c.modelId === modelId && c.part === oldName
          ? { ...c, part: trimmed, label: c.label.replace(oldName, trimmed) }
          : c,
      ),
    );
    setSelectedLayer((current) => (current === oldName ? trimmed : current));
  }, []);

  const deleteModelLayer = useCallback((modelId: string, layerName: string) => {
    setModels((current) =>
      current.map((m) => {
        if (m.id !== modelId) return m;
        const nextCode = deleteLayerInCode(m.code, layerName);
        return nextCode === m.code ? m : { ...m, code: nextCode };
      }),
    );
    setClips((current) => current.filter((c) => !(c.modelId === modelId && c.part === layerName)));
    setSelectedLayer((current) => (current === layerName ? null : current));
  }, []);

  /** Fuse selected models into one real animatable module on a shared plane. */
  const mergeSelectedModels = useCallback(() => {
    void run('Merging models…', async () => {
      const ids = selectedModelIds.filter((id) => models.some((m) => m.id === id));
      if (ids.length < 2) {
        throw new Error('Shift-click at least two models, then merge.');
      }

      const leafIds: string[] = [];
      for (const id of ids) {
        const model = models.find((m) => m.id === id);
        if (!model) continue;
        if (model.childIds?.length) {
          for (const childId of model.childIds) {
            if (!leafIds.includes(childId)) leafIds.push(childId);
          }
        } else if (!leafIds.includes(id)) {
          leafIds.push(id);
        }
      }
      if (leafIds.length < 2) {
        throw new Error('Need at least two distinct models to merge.');
      }

      const children = leafIds
        .map((id) => models.find((m) => m.id === id))
        .filter((m): m is SceneModel => Boolean(m));

      const fusedCode = fuseSceneModules(children.map((c) => ({ name: c.name, code: c.code })));

      const id = makeId();
      const name = children.map((m) => m.name).join(' + ');
      setModels((current) => [
        ...current,
        {
          id,
          name: name.length > 48 ? `${name.slice(0, 48)}…` : name,
          code: fusedCode,
          createdAt: Date.now(),
          childIds: leafIds,
        },
      ]);
      setActiveModelId(id);
      setSelectedModelIds([id]);
      setSelectedLayer(null);
      setTimelineFocusModelId(id);
      setStatus({
        kind: 'info',
        text: `Merged ${children.length} models into one animatable scene.`,
      });
    });
  }, [selectedModelIds, models, run]);

  const toggleLaneCollapsed = useCallback((laneId: string) => {
    setCollapsedLanes((current) => {
      const next = new Set(current);
      if (next.has(laneId)) next.delete(laneId);
      else next.add(laneId);
      return next;
    });
  }, []);

  const moveClip = useCallback((id: string, start: number) => {
    const nextStart = Math.max(0, Math.floor(start));
    setClips((current) => {
      const clip = current.find((c) => c.id === id);
      if (!clip) return current;
      const duration = clip.duration;
      return current
        .filter(
          (c) =>
            c.id === id ||
            !(
              c.modelId === clip.modelId &&
              c.part === clip.part &&
              clipsOverlap(nextStart, duration, c.start, c.duration)
            ),
        )
        .map((c) => (c.id === id ? { ...c, start: nextStart } : c))
        .sort((a, b) => a.start - b.start || a.part.localeCompare(b.part));
    });
  }, []);

  const addClipAtSecond = useCallback(
    (modelId: string, second: number) => {
      const model = models.find((m) => m.id === modelId);
      if (!model) return;
      const start = Math.max(0, Math.floor(second));
      let animation = model.animation;
      const animationId = animation?.id ?? makeId();
      const duration = animation?.duration ?? 1;

      // Ensure a placeholder animation duplicate exists if the model was dragged without one.
      if (!animation) {
        animation = {
          id: animationId,
          name: model.name,
          duration,
          code: model.code,
          parts: [WHOLE_PART],
          createdAt: Date.now(),
        };
        setModels((current) =>
          current.map((m) => (m.id === modelId ? { ...m, animation } : m)),
        );
      }

      setClips((current) => {
        const next = current.filter(
          (c) => !(c.modelId === modelId && c.part === WHOLE_PART && clipsOverlap(start, duration, c.start, c.duration)),
        );
        next.push({
          id: makeId(),
          modelId,
          animationId,
          part: WHOLE_PART,
          label: model.name,
          start,
          duration,
        });
        return next.sort((a, b) => a.start - b.start || a.part.localeCompare(b.part));
      });
    },
    [models],
  );

  const deleteClip = useCallback((id: string) => {
    setClips((current) => current.filter((c) => c.id !== id));
  }, []);

  const copyClip = useCallback(
    (id: string) => {
      const clip = clips.find((c) => c.id === id);
      if (clip) setClipboardClip(clip);
    },
    [clips],
  );

  const pasteClip = useCallback(
    (second: number) => {
      if (!clipboardClip) return;
      const start = Math.max(0, Math.floor(second));
      const duration = clipboardClip.duration;
      setClips((current) =>
        [
          ...current.filter(
            (c) =>
              !(
                c.modelId === clipboardClip.modelId &&
                c.part === clipboardClip.part &&
                clipsOverlap(start, duration, c.start, c.duration)
              ),
          ),
          { ...clipboardClip, id: makeId(), start },
        ].sort((a, b) => a.start - b.start || a.part.localeCompare(b.part)),
      );
    },
    [clipboardClip],
  );

  const resizeClip = useCallback((id: string, duration: number) => {
    setClips((current) => {
      const clip = current.find((c) => c.id === id);
      if (!clip) return current;
      const nextOnLane = current
        .filter(
          (c) =>
            c.id !== id &&
            c.modelId === clip.modelId &&
            c.part === clip.part &&
            c.start >= clip.start,
        )
        .reduce<Clip | undefined>((closest, c) => (!closest || c.start < closest.start ? c : closest), undefined);
      const maxDuration = nextOnLane ? nextOnLane.start - clip.start : Infinity;
      const clamped = Math.min(Math.max(duration, MIN_CLIP_DURATION), maxDuration);
      return current.map((c) => (c.id === id ? { ...c, duration: clamped } : c));
    });
  }, []);

  const exportCode = useCallback(
    (format: api.CodeExportFormat = 'standalone') =>
      run('Exporting code…', async () => {
        const blob = await api.exportCodeZip(code, format);
        const fileName = `zendai-scene-${format}.zip`;
        downloadBlob(blob, fileName);
        setStatus({ kind: 'info', text: `Project exported as ${fileName}.` });
      }),
    [run, code],
  );

  const exportMp4 = useCallback(
    (settings: RenderSettings) =>
      run('Starting MP4 render…', async () => {
        const { jobId } = await api.startMp4Export(code, settings);
        setMp4Job({ id: jobId, status: 'running', progress: 0, message: 'Queued' });
        const renderModelId = activeModelId;
        const renderModelName = activeModel.name;
        if (pollRef.current !== null) window.clearInterval(pollRef.current);
        pollRef.current = window.setInterval(async () => {
          try {
            const job = await api.getMp4Job(jobId);
            setMp4Job({
              id: jobId,
              status: job.status,
              progress: job.progress,
              message: job.message,
              url: job.result?.url,
              error: job.error,
            });
            if (job.status !== 'running' && pollRef.current !== null) {
              window.clearInterval(pollRef.current);
              pollRef.current = null;
            }
            if (job.status === 'done') {
              setClips((current) => {
                const nextStart = current.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
                const animId = makeId();
                return [
                  ...current,
                  {
                    id: makeId(),
                    modelId: renderModelId,
                    animationId: animId,
                    part: WHOLE_PART,
                    label: renderModelName,
                    start: nextStart,
                    duration: settings.durationInSeconds,
                  },
                ];
              });
            }
          } catch {
            // transient poll failure — keep polling
          }
        }, 2000);
      }),
    [run, code, activeModelId, activeModel.name],
  );

  const resetToDefault = useCallback(() => {
    const seed = makeDefaultModel();
    setModels([seed]);
    setActiveModelId(seed.id);
    setSelectedModelIds([seed.id]);
    setSelectedLayer(null);
    setTimelineFocusModelId(seed.id);
    setClips([]);
    setMp4Job(null);
    setStatus({ kind: 'info', text: 'Reset to Default model.' });
  }, []);

  const replaceFromRemote = useCallback(
    (remote: Array<{ id: string; name: string; code: string }>) => {
      if (remote.length === 0) {
        resetToDefault();
        setStatus({
          kind: 'info',
          text: 'Linked repo has no models — reset to Default.',
        });
        return;
      }
      const next: SceneModel[] = remote.map((m) => ({
        id: m.id,
        name: m.name,
        code: m.code,
        createdAt: Date.now(),
      }));
      setModels(next);
      setActiveModelId(next[0].id);
      setSelectedModelIds([next[0].id]);
      setSelectedLayer(null);
      setTimelineFocusModelId(next[0].id);
      setClips([]);
      setStatus({
        kind: 'info',
        text: `Loaded ${next.length} model${next.length === 1 ? '' : 's'} from linked GitHub repo.`,
      });
    },
    [resetToDefault],
  );

  return {
    code,
    setCode,
    tunables,
    setParam,
    busy,
    status,
    mp4Job,
    models,
    activeModelId,
    selectedModelIds,
    selectedLayer,
    setActiveModel,
    selectModel,
    selectLayer,
    mergeSelectedModels,
    renameModel,
    renameModelLayer,
    deleteModelLayer,
    viewportScenes,
    clips,
    addClipAtSecond,
    deleteClip,
    copyClip,
    pasteClip,
    resizeClip,
    moveClip,
    hasClipboardClip: clipboardClip !== null,
    timelineClips,
    timelineLanes: visibleLanes,
    allTimelineLanes: timelineLanes,
    timelineFocusModelId,
    setTimelineFocusModelId,
    collapsedLanes,
    toggleLaneCollapsed,
    timelineTotal,
    playback,
    previewCode,
    previewScenes,
    previewTime,
    previewTrackOverlays,
    previewModelName,
    generate,
    modify,
    animate,
    aspectRatio,
    setAspectRatio,
    exportCode,
    exportMp4,
    replaceFromRemote,
    resetToDefault,
  };
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Resolve a model into viewport scene entries. Merges are one fused module. */
export function resolveViewportScenes(
  model: SceneModel,
  _allModels: SceneModel[] = [],
): Array<{ id: string; code: string }> {
  return [{ id: model.id, code: model.code }];
}

/** Build timeline lanes: singular model = one row; merge = model + children (1 deep). */
function buildTimelineLanes(models: SceneModel[], clips: Clip[]): TimelineLane[] {
  const lanes: TimelineLane[] = [];
  const modelsById = new Map(models.map((m) => [m.id, m]));

  // Prefer models that appear on the timeline; always include ones with an animation.
  const modelIds = new Set<string>();
  for (const clip of clips) modelIds.add(clip.modelId);
  for (const model of models) {
    if (model.animation) modelIds.add(model.id);
  }
  // If nothing yet, still show the first few models so the NLE isn't empty.
  if (modelIds.size === 0) {
    for (const model of models.slice(0, 3)) modelIds.add(model.id);
  }

  for (const modelId of modelIds) {
    const model = modelsById.get(modelId);
    if (!model) continue;

    const modelLaneId = model.id;
    lanes.push({
      id: modelLaneId,
      label: model.name,
      depth: 0,
      modelId: model.id,
    });

    // Merges expose child models one level down — no part/component lanes.
    for (const childId of model.childIds ?? []) {
      const child = modelsById.get(childId);
      if (!child) continue;
      lanes.push({
        id: `${model.id}::child::${child.id}`,
        label: child.name,
        depth: 1,
        modelId: model.id,
        parentId: modelLaneId,
      });
    }
  }

  return lanes;
}
