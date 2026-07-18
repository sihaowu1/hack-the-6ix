import { useEffect, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { CaretRight, Pause, Play, Rewind, SkipBack, SkipForward, FastForward } from '@phosphor-icons/react';
import { PLAYBACK_RATES, type TimelinePlayback } from './useTimelinePlayback';
import {
  deriveTimelineTotal,
  MIN_CLIP_DURATION,
  type TimelineClip,
  type TimelineLane,
} from './timelineMath';
import { IconButton } from '../ui/Button';

export type { TimelineClip, TimelineLane } from './timelineMath';
export { deriveTimelineTotal, partLaneId } from './timelineMath';

/** Drag-and-drop MIME type used to carry a model id onto the timeline (and the video preview). */
export const MODEL_DRAG_TYPE = 'application/x-motionforge-model-id';

export interface TimelineModelOption {
  id: string;
  name: string;
}

export interface TimelineProps {
  clips: TimelineClip[];
  /** Hierarchical lanes (model, or merge → children). When empty, falls back to a single track. */
  lanes?: TimelineLane[];
  collapsedLaneIds?: Set<string>;
  onToggleLane?: (laneId: string) => void;
  /** Same value passed to `useTimelinePlayback` — see `deriveTimelineTotal`. */
  totalDuration?: number;
  /** Shared playhead state/controls from `useTimelinePlayback`. */
  playback: TimelinePlayback;
  /** Drops a material at the given whole second, dropped from the Materials list onto the track. */
  onDropModel?: (modelId: string, second: number) => void;
  /** Deletes a clip (right-click menu → Delete). Omit to disable the context menu entirely. */
  onDeleteClip?: (clipId: string) => void;
  /** Stashes a clip in the clipboard (right-click menu → Copy). */
  onCopyClip?: (clipId: string) => void;
  /** Pastes the clipboard clip at the given whole second (right-click menu → Paste). */
  onPasteClip?: (second: number) => void;
  /** Whether a clip is currently in the clipboard, so Paste can be enabled/disabled. */
  hasClipboardClip?: boolean;
  /**
   * Sets a clip's duration (drag-to-resize via the handle on its right edge).
   */
  onResizeClip?: (clipId: string, duration: number) => void;
  /** Moves a clip's start time (drag the clip body). */
  onMoveClip?: (clipId: string, start: number) => void;
  /** Models available in the timeline filter dropdown. */
  modelOptions?: TimelineModelOption[];
  focusModelId?: string;
  onFocusModelChange?: (modelId: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  clipId?: string;
  second: number;
}

interface ResizeState {
  clipId: string;
  initialDuration: number;
  startClientX: number;
  pxPerSecond: number;
}

interface MoveState {
  clipId: string;
  initialStart: number;
  startClientX: number;
  pxPerSecond: number;
}

const LANE_HEIGHT = 28;

/**
 * Hierarchical multi-track timeline: one lane per model / child / part, with
 * independently schedulable bars. Playback state is owned by the caller.
 */
export function Timeline({
  clips,
  lanes = [],
  collapsedLaneIds,
  onToggleLane,
  totalDuration,
  playback,
  onDropModel,
  onDeleteClip,
  onCopyClip,
  onPasteClip,
  hasClipboardClip,
  onResizeClip,
  onMoveClip,
  modelOptions,
  focusModelId,
  onFocusModelChange,
}: TimelineProps) {
  const total = deriveTimelineTotal(clips, totalDuration);
  const {
    currentTime,
    isPlaying,
    playbackRate,
    seek,
    togglePlay,
    skipToStart,
    skipToEnd,
    stepBack,
    stepForward,
    setPlaybackRate,
  } = playback;
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuEnabled = Boolean(onDeleteClip || onCopyClip || onPasteClip);
  const [resizing, setResizing] = useState<ResizeState | null>(null);
  const [moving, setMoving] = useState<MoveState | null>(null);

  const useLanes = lanes.length > 0;

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  function seekToClientX(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    seek(fraction * total);
  }

  function timeAtClientX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    return fraction * total;
  }

  function handleTrackDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (!onDropModel || !event.dataTransfer.types.includes(MODEL_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDropTarget(true);
  }

  function handleTrackDrop(event: ReactDragEvent<HTMLDivElement>) {
    setIsDropTarget(false);
    event.preventDefault();
    if (!onDropModel) return;
    const modelId = event.dataTransfer.getData(MODEL_DRAG_TYPE);
    if (!modelId) return;
    onDropModel(modelId, timeAtClientX(event.clientX));
  }

  function handleTrackContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!contextMenuEnabled) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, second: timeAtClientX(event.clientX) });
  }

  function handleClipContextMenu(event: ReactMouseEvent<HTMLDivElement>, clipId: string) {
    if (!contextMenuEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, clipId, second: timeAtClientX(event.clientX) });
  }

  function handleResizeHandlePointerDown(event: ReactPointerEvent<HTMLDivElement>, clip: TimelineClip) {
    if (!onResizeClip) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const el = trackRef.current;
    const pxPerSecond = el ? el.getBoundingClientRect().width / total : 1;
    setResizing({ clipId: clip.id, initialDuration: clip.duration, startClientX: event.clientX, pxPerSecond });
  }

  function handleResizeHandlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!resizing || !onResizeClip) return;
    const deltaSeconds = (event.clientX - resizing.startClientX) / resizing.pxPerSecond;
    onResizeClip(resizing.clipId, Math.max(MIN_CLIP_DURATION, resizing.initialDuration + deltaSeconds));
  }

  function handleResizeHandlePointerUp() {
    setResizing(null);
  }

  function handleClipBodyPointerDown(event: ReactPointerEvent<HTMLDivElement>, clip: TimelineClip) {
    if (!onMoveClip || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const el = trackRef.current;
    const pxPerSecond = el ? el.getBoundingClientRect().width / total : 1;
    setMoving({ clipId: clip.id, initialStart: clip.start, startClientX: event.clientX, pxPerSecond });
  }

  function handleClipBodyPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!moving || !onMoveClip) return;
    const deltaSeconds = (event.clientX - moving.startClientX) / moving.pxPerSecond;
    onMoveClip(moving.clipId, Math.max(0, moving.initialStart + deltaSeconds));
  }

  function handleClipBodyPointerUp() {
    setMoving(null);
  }

  function handleScrubberPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    seekToClientX(event.clientX);
  }

  function handleScrubberPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1) return;
    seekToClientX(event.clientX);
  }

  const playheadPct = (currentTime / total) * 100;

  const clipsByLane = (laneId: string) =>
    clips.filter((c) => (c.laneId ?? 'default') === laneId);

  return (
    <div className="flex h-full w-full min-h-0 flex-col gap-1.5 p-1" aria-label="Timeline">
      <div className="flex flex-shrink-0 items-center gap-2">
        <TransportBar
          currentTime={currentTime}
          total={total}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          onTogglePlay={togglePlay}
          onSkipToStart={skipToStart}
          onSkipToEnd={skipToEnd}
          onStepBack={stepBack}
          onStepForward={stepForward}
          onSetPlaybackRate={setPlaybackRate}
        />
        {modelOptions && modelOptions.length > 0 && onFocusModelChange && (
          <label className="ml-auto flex items-center gap-1.5 text-[12px] text-text-dim">
            <span className="whitespace-nowrap">Model</span>
            <select
              className="max-w-[160px] rounded border border-border bg-bg px-1.5 py-0.5 text-[12px] text-text"
              aria-label="Filter timeline by model"
              value={focusModelId ?? modelOptions[0]?.id ?? ''}
              onChange={(event) => onFocusModelChange(event.target.value)}
            >
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden">
        {useLanes && (
          <div className="flex w-[140px] flex-shrink-0 flex-col overflow-y-auto border-r border-border pt-4">
            {lanes.map((lane) => {
              // Children of a collapsed parent are filtered out of `lanes`, so
              // also treat "currently collapsed" as having children — otherwise
              // the caret vanishes and the lane can never be re-expanded.
              const hasChildren =
                lanes.some((l) => l.parentId === lane.id) || Boolean(collapsedLaneIds?.has(lane.id));
              const collapsed = collapsedLaneIds?.has(lane.id);
              return (
                <div
                  key={lane.id}
                  className="flex items-center gap-1 border-b border-border/60 px-1.5 text-[11px] text-text-dim"
                  style={{
                    height: LANE_HEIGHT,
                    paddingLeft: 6 + lane.depth * 10,
                  }}
                  title={lane.label}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center border-none bg-transparent p-0 text-text-dim hover:text-text"
                      onClick={() => onToggleLane?.(lane.id)}
                      aria-label={collapsed ? 'Expand' : 'Collapse'}
                    >
                      <CaretRight
                        size={10}
                        weight="bold"
                        className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}
                      />
                    </button>
                  ) : (
                    <span className="w-4 flex-shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {lane.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div
          ref={trackRef}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-1 cursor-pointer touch-none overflow-y-auto"
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onDragOver={handleTrackDragOver}
          onDragLeave={() => setIsDropTarget(false)}
          onDrop={handleTrackDrop}
          onContextMenu={handleTrackContextMenu}
        >
          <Ruler total={total} />
          <div
            className={`relative flex flex-col overflow-hidden rounded-md border border-border bg-bg-raised ${
              isDropTarget ? 'shadow-[inset_0_0_0_2px_var(--color-accent)]' : ''
            }`}
            role="list"
            style={{ minHeight: useLanes ? lanes.length * LANE_HEIGHT : 40 }}
          >
            {clips.length === 0 && (
              <span className="absolute inset-0 flex items-center justify-center text-[14px] text-text-dim">
                No clips yet — animate a model to add bars.
              </span>
            )}
            {useLanes
              ? lanes.map((lane) => {
                  const laneClips = lane.part !== undefined || !lanes.some((c) => c.parentId === lane.id)
                    ? clipsByLane(lane.id)
                    : [];
                  return (
                    <div
                      key={lane.id}
                      className="relative border-b border-border/40"
                      style={{ height: LANE_HEIGHT }}
                      role="presentation"
                    >
                      {laneClips.map((clip) => {
                        const leftPct = (clip.start / total) * 100;
                        const widthPct = (clip.duration / total) * 100;
                        return (
                          <div
                            key={clip.id}
                            role="listitem"
                            title={`${clip.label} — ${clip.start.toFixed(2)}s → ${(
                              clip.start + clip.duration
                            ).toFixed(2)}s`}
                            className={`absolute top-0.5 bottom-0.5 flex min-w-[2px] items-center overflow-hidden rounded-[3px] px-1.5 text-[10px] font-semibold text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)] ${
                              onMoveClip ? 'cursor-grab active:cursor-grabbing' : ''
                            }`}
                            onContextMenu={(event) => handleClipContextMenu(event, clip.id)}
                            onPointerDown={(event) => handleClipBodyPointerDown(event, clip)}
                            onPointerMove={handleClipBodyPointerMove}
                            onPointerUp={handleClipBodyPointerUp}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              background: clip.color ?? 'var(--color-scene)',
                            }}
                          >
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{clip.label}</span>
                            {onResizeClip && (
                              <div
                                className="absolute -right-0.5 top-0 bottom-0 w-2.5 cursor-ew-resize touch-none rounded-r-[3px] hover:bg-[rgba(255,255,255,0.35)]"
                                onPointerDown={(event) => handleResizeHandlePointerDown(event, clip)}
                                onPointerMove={handleResizeHandlePointerMove}
                                onPointerUp={handleResizeHandlePointerUp}
                                aria-label={`Resize ${clip.label}`}
                                role="slider"
                                aria-valuenow={clip.duration}
                                aria-orientation="horizontal"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              : clips.map((clip) => {
                  const leftPct = (clip.start / total) * 100;
                  const widthPct = (clip.duration / total) * 100;
                  return (
                    <div
                      key={clip.id}
                      role="listitem"
                      title={`${clip.label} — ${clip.start.toFixed(2)}s → ${(
                        clip.start + clip.duration
                      ).toFixed(2)}s`}
                      className={`absolute top-1 bottom-1 flex min-w-[2px] items-center overflow-hidden rounded-[3px] px-1.5 text-xs font-semibold text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)] ${
                        onMoveClip ? 'cursor-grab active:cursor-grabbing' : ''
                      }`}
                      onContextMenu={(event) => handleClipContextMenu(event, clip.id)}
                      onPointerDown={(event) => handleClipBodyPointerDown(event, clip)}
                      onPointerMove={handleClipBodyPointerMove}
                      onPointerUp={handleClipBodyPointerUp}
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background: clip.color ?? 'var(--color-scene)',
                      }}
                    >
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap">{clip.label}</span>
                      {onResizeClip && (
                        <div
                          className="absolute -right-0.5 top-0 bottom-0 w-2.5 cursor-ew-resize touch-none rounded-r-[3px] hover:bg-[rgba(255,255,255,0.35)]"
                          onPointerDown={(event) => handleResizeHandlePointerDown(event, clip)}
                          onPointerMove={handleResizeHandlePointerMove}
                          onPointerUp={handleResizeHandlePointerUp}
                          aria-label={`Resize ${clip.label}`}
                          role="slider"
                          aria-valuenow={clip.duration}
                          aria-orientation="horizontal"
                        />
                      )}
                    </div>
                  );
                })}
            <div
              className="pointer-events-none absolute bottom-0 top-0 w-0 -translate-x-px border-l-2 border-accent"
              style={{ left: `${playheadPct}%` }}
              aria-hidden="true"
            >
              <div className="absolute -left-1 -top-0 h-2 w-2 rounded-full bg-accent" />
            </div>
          </div>
        </div>
      </div>
      {contextMenu && (
        <ClipContextMenu
          state={contextMenu}
          hasClipboardClip={Boolean(hasClipboardClip)}
          onDelete={onDeleteClip}
          onCopy={onCopyClip}
          onPaste={onPasteClip}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

interface ClipContextMenuProps {
  state: ContextMenuState;
  hasClipboardClip: boolean;
  onDelete?: (clipId: string) => void;
  onCopy?: (clipId: string) => void;
  onPaste?: (second: number) => void;
  onClose: () => void;
}

function ClipContextMenu({ state, hasClipboardClip, onDelete, onCopy, onPaste, onClose }: ClipContextMenuProps) {
  const { x, y, clipId, second } = state;
  const itemClass =
    'block w-full cursor-pointer whitespace-nowrap border-0 bg-transparent px-3 py-1.5 text-left text-[13px] text-text hover:bg-bg-hover disabled:cursor-not-allowed disabled:text-text-dim disabled:hover:bg-transparent';

  return (
    <div
      className="fixed z-50 min-w-[140px] rounded-md border border-border bg-bg-panel py-1 shadow-lg"
      style={{ left: x, top: y }}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        disabled={!clipId || !onDelete}
        onClick={() => {
          if (clipId && onDelete) onDelete(clipId);
          onClose();
        }}
      >
        Delete
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        disabled={!clipId || !onCopy}
        onClick={() => {
          if (clipId && onCopy) onCopy(clipId);
          onClose();
        }}
      >
        Copy
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemClass}
        disabled={!hasClipboardClip || !onPaste}
        onClick={() => {
          if (onPaste) onPaste(second);
          onClose();
        }}
      >
        Paste
      </button>
    </div>
  );
}

interface TransportBarProps {
  currentTime: number;
  total: number;
  isPlaying: boolean;
  playbackRate: number;
  onTogglePlay: () => void;
  onSkipToStart: () => void;
  onSkipToEnd: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSetPlaybackRate: (rate: number) => void;
}

function TransportBar({
  currentTime,
  total,
  isPlaying,
  playbackRate,
  onTogglePlay,
  onSkipToStart,
  onSkipToEnd,
  onStepBack,
  onStepForward,
  onSetPlaybackRate,
}: TransportBarProps) {
  const transportButtonClass = 'h-7 w-7';

  return (
    <div className="flex flex-shrink-0 items-center gap-1" role="toolbar" aria-label="Playback controls">
      <IconButton type="button" className={transportButtonClass} onClick={onSkipToStart} aria-label="Skip to start">
        <SkipBack size={14} weight="fill" />
      </IconButton>
      <IconButton type="button" className={transportButtonClass} onClick={onStepBack} aria-label="Step back 1 second">
        <Rewind size={14} weight="fill" />
      </IconButton>
      <IconButton
        type="button"
        active
        className="h-7 w-8"
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
      </IconButton>
      <IconButton type="button" className={transportButtonClass} onClick={onStepForward} aria-label="Step forward 1 second">
        <FastForward size={14} weight="fill" />
      </IconButton>
      <IconButton type="button" className={transportButtonClass} onClick={onSkipToEnd} aria-label="Skip to end">
        <SkipForward size={14} weight="fill" />
      </IconButton>
      <span className="ml-1.5 font-mono text-[13px] tabular-nums text-text-dim">
        {formatSeconds(currentTime)} / {formatSeconds(total)}
      </span>
      <span className="ml-auto flex gap-0.5" role="group" aria-label="Playback speed">
        {PLAYBACK_RATES.map((rate) => (
          <button
            key={rate}
            type="button"
            className={`rounded-md border border-border px-1.5 py-0.5 text-[12px] tabular-nums cursor-pointer transition-colors ${
              rate === playbackRate
                ? 'bg-bg-hover text-text'
                : 'bg-bg-raised text-text-dim hover:text-text hover:bg-bg-hover'
            }`}
            onClick={() => onSetPlaybackRate(rate)}
            aria-pressed={rate === playbackRate}
          >
            {rate}×
          </button>
        ))}
      </span>
    </div>
  );
}

function Ruler({ total }: { total: number }) {
  const step = pickTickStep(total);
  const ticks: number[] = [];
  for (let t = 0; t <= total + 1e-6; t += step) ticks.push(t);

  return (
    <div className="relative h-4 flex-shrink-0 text-[11px] text-text-dim" aria-hidden="true">
      {ticks.map((t) => (
        <span
          key={t}
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${(t / total) * 100}%` }}
        >
          {formatSeconds(t)}
        </span>
      ))}
    </div>
  );
}

function pickTickStep(total: number): number {
  const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const targetTicks = 6;
  for (const c of candidates) {
    if (total / c <= targetTicks) return c;
  }
  return candidates[candidates.length - 1];
}

function formatSeconds(t: number): string {
  if (t < 60) return `${t % 1 === 0 ? t.toFixed(0) : t.toFixed(1)}s`;
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
