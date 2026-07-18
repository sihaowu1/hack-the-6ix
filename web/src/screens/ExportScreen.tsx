import type { CSSProperties } from 'react';
import type { TunableParam } from '@motionforge/shared';
import type { ParamChange } from '../controls/ControlsPanel';
import { ResizeHandle } from '../layout/ResizeHandle';
import { useResizable } from '../layout/useResizable';
import { Timeline } from '../timeline/Timeline';
import type { TimelineClip } from '../timeline/timelineMath';
import type { TimelinePlayback } from '../timeline/useTimelinePlayback';
import type { Mp4JobState } from '../state/useSceneProject';
import { VideoPreview } from '../video/VideoPreview';

export interface ExportScreenProps {
  /** The active model's tunables (from `useSceneProject.tunables`), edited via the click floater. */
  tunables: TunableParam[];
  /** Patches a tunable on the active model (from `useSceneProject.setParam`). */
  onParamChange: ParamChange;
  /** Current MP4 render job from `useSceneProject.mp4Job`. */
  mp4Job: Mp4JobState | null;
  /** Timeline clips (from `useSceneProject.timelineClips`), rendered read-only below the preview. */
  timelineClips: TimelineClip[];
  /** Timeline length in seconds (from `useSceneProject.timelineTotal`). */
  timelineTotal: number;
  /**
   * Shared playhead (from `useSceneProject.playback`) — the same clock the
   * Video Generation screen's timeline reads, so the preview here shows
   * exactly what that screen shows without re-deriving anything.
   */
  playback: TimelinePlayback;
  /** Scene code for whatever's under the playhead (from `useSceneProject.previewCode`); undefined shows a black screen. */
  previewCode: string | undefined;
  /** Playhead position local to the active clip (from `useSceneProject.previewTime`). */
  previewTime: number;
  /** Display name for whatever's under the playhead (from `useSceneProject.previewModelName`). */
  previewModelName: string;
}

/**
 * Screen 3 — Export.
 *
 *   +------------------+---------------------------+
 *   | Export options   |                           |
 *   | Export to GitHub |   Resulting Video          |
 *   | (left)           |   (same preview as the     |
 *   |                  |    Video Generation screen)|
 *   +------------------+---------------------------+
 *   |              Timeline (full width, read-only) |
 *   +-----------------------------------------------+
 *
 * The preview and timeline read the same shared playhead/derived clip as
 * the Video Generation screen (`useSceneProject.playback`/`previewCode`) —
 * scrubbing or playing here is exactly the Video screen's timeline, not a
 * separate copy, so nothing needs to be regenerated to "sync" the two.
 * This timeline is playback-only: no drag-and-drop from Materials (there's
 * no Materials pane here), just transport controls and a speed selector.
 *
 * Export options/GitHub push are still a placeholder (see SPEC.md Issue 5).
 */
export function ExportScreen({
  tunables,
  onParamChange,
  mp4Job,
  timelineClips,
  timelineTotal,
  playback,
  previewCode,
  previewTime,
  previewModelName,
}: ExportScreenProps) {
  const leftWidth = useResizable({
    direction: 'horizontal',
    initial: 340,
    min: 260,
    max: 640,
    storageKey: 'motionforge:export-screen:left-width',
  });
  const timelineHeight = useResizable({
    direction: 'vertical',
    initial: 160,
    min: 120,
    max: 360,
    storageKey: 'motionforge:export-screen:timeline-height',
    invert: true,
  });

  return (
    <div style={{ ...styles.root, gridTemplateRows: `1fr 1px ${timelineHeight.size}px` }}>
      <main className="export-screen" style={{ gridTemplateColumns: `${leftWidth.size}px 1px 1fr` }}>
        <div className="export-screen__left">
          <section className="panel" aria-label="Export options">
            <h2>Export options</h2>
            <p className="hint">Download the generated project as code, or render it to an MP4.</p>
            <button type="button" disabled>
              Export code (.zip)
            </button>
            <button type="button" disabled>
              Render MP4 (Remotion)
            </button>
          </section>
          <section className="panel" aria-label="Export to GitHub">
            <h2>Export to GitHub</h2>
            <p className="hint">Push the generated project straight to a GitHub repository.</p>
            <input type="text" placeholder="owner/repo" disabled />
            <button type="button" disabled>
              Push to GitHub
            </button>
          </section>
        </div>
        <ResizeHandle direction="horizontal" onPointerDown={leftWidth.startDragging} label="Resize export options" />
        <div className="export-screen__right">
          <VideoPreview
            job={mp4Job}
            code={previewCode}
            tunables={tunables}
            onParamChange={onParamChange}
            modelName={previewModelName}
            enableClickFloater={false}
            time={previewTime}
          />
        </div>
      </main>
      <ResizeHandle direction="vertical" onPointerDown={timelineHeight.startDragging} label="Resize timeline" />
      <div style={styles.timeline}>
        <Timeline clips={timelineClips} totalDuration={timelineTotal} playback={playback} />
      </div>
    </div>
  );
}

const styles = {
  root: {
    display: 'grid',
    gap: 0,
    flex: 1,
    minHeight: 0,
  },
  timeline: {
    minHeight: 0,
    display: 'flex',
    padding: '4px 8px',
    background: 'var(--bg-panel)',
  },
} satisfies Record<string, CSSProperties>;
