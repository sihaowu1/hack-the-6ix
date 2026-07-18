import type { CSSProperties, ReactNode } from 'react';
import { Timeline } from '../timeline/Timeline';
import type { Clip, Mp4JobState, SceneModel } from '../state/useSceneProject';

export interface VideoGenerationScreenProps {
  /** Models generated on the Model Generation screen (from `useSceneProject.models`). */
  models: SceneModel[];
  /** Current MP4 render job from `useSceneProject.mp4Job`. */
  mp4Job: Mp4JobState | null;
  /** Timeline clips (from `useSceneProject.clips`), rendered in the bottom row. */
  clips: Clip[];
  /** Optional slot for the chat pane (component not built yet — see SPEC.md Issue 4). */
  chat?: ReactNode;
}

/**
 * Screen 2 — Video Generation.
 *
 *   +------------+------------+------------------+
 *   | Chat       | Materials  |                  |
 *   | (top-left) | (from      |  Resulting Video |
 *   |            |  Screen 1) |  (top-right)     |
 *   +------------+------------+------------------+
 *   |              Timeline (full width)         |
 *   +--------------------------------------------+
 */
export function VideoGenerationScreen({
  models,
  mp4Job,
  clips,
  chat,
}: VideoGenerationScreenProps) {
  return (
    <section className="video-screen" style={styles.root}>
      <div className="video-screen__top" style={styles.top}>
        <Pane title="Chat" area="chat">
          {chat ?? <Placeholder label="Chat" hint="Prompt the AI to edit or extend the video." />}
        </Pane>
        <Pane title="Materials" area="materials">
          <MaterialsList models={models} />
        </Pane>
        <Pane title="Resulting Video" area="video">
          <VideoPreview job={mp4Job} />
        </Pane>
      </div>
      <div className="video-screen__timeline" style={styles.timeline}>
        <Pane title="Timeline" area="timeline">
          <Timeline
            clips={clips.map((c) => ({
              id: c.id,
              label: c.label,
              start: c.start,
              duration: c.duration,
            }))}
          />
        </Pane>
      </div>
    </section>
  );
}

/**
 * Read-only list of models generated on the Model Generation screen.
 * Purely a view over the `models` prop — no local state, no fetching.
 */
function MaterialsList({ models }: { models: SceneModel[] }) {
  if (models.length === 0) {
    return (
      <Placeholder
        label="No materials yet"
        hint="Generate a model on the Model Generation screen to see it here."
      />
    );
  }
  return (
    <ul style={styles.materialsList}>
      {models.map((m) => (
        <li key={m.id} style={styles.materialItem}>
          <div style={styles.materialThumbFallback} aria-hidden="true" />
          <span style={styles.materialName} title={m.name}>
            {m.name}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Playback of the current Remotion render.
 * Renders one of four states straight from `mp4Job`:
 *   - null          → "not rendered yet" placeholder
 *   - running       → progress placeholder
 *   - error         → error placeholder
 *   - done + url    → <video> element
 */
function VideoPreview({ job }: { job: Mp4JobState | null }) {
  if (!job) {
    return (
      <Placeholder
        label="No render yet"
        hint="Start a render from the export panel to see the result here."
      />
    );
  }
  if (job.status === 'running') {
    const pct = Math.round((job.progress ?? 0) * 100);
    return (
      <Placeholder
        label={`Rendering… ${pct}%`}
        hint={job.message || 'The MP4 render is in progress.'}
      />
    );
  }
  if (job.status === 'error') {
    return (
      <Placeholder label="Render failed" hint={job.error || 'The MP4 render did not complete.'} />
    );
  }
  if (job.status === 'done' && job.url) {
    return (
      <video
        key={job.url}
        src={job.url}
        controls
        style={styles.video}
        aria-label="Rendered video preview"
      />
    );
  }
  return <Placeholder label="Render finished" hint="Waiting for the video URL…" />;
}

function Pane({
  title,
  area,
  children,
}: {
  title: string;
  area: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`video-screen__pane video-screen__pane--${area}`}
      style={styles.pane}
      aria-label={title}
    >
      <header style={styles.paneHeader}>{title}</header>
      <div style={styles.paneBody}>{children}</div>
    </div>
  );
}

function Placeholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={styles.placeholder}>
      <div style={styles.placeholderLabel}>{label}</div>
      <div style={styles.placeholderHint}>{hint}</div>
    </div>
  );
}

const styles = {
  root: {
    display: 'grid',
    gridTemplateRows: '1fr auto',
    gap: 10,
    padding: 10,
    minHeight: 0,
    height: '100%',
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  top: {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 1fr) minmax(200px, 1fr) minmax(320px, 2fr)',
    gap: 10,
    minHeight: 0,
  },
  timeline: {
    minHeight: 140,
    height: '22vh',
    maxHeight: 260,
    display: 'flex',
  },
  pane: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    flex: 1,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  paneHeader: {
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
    background: 'var(--bg-raised)',
    borderBottom: '1px solid var(--border)',
  },
  paneBody: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: 12,
  },
  placeholder: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: 6,
    color: 'var(--text-dim)',
    border: '1px dashed var(--border)',
    borderRadius: 4,
    padding: 16,
  },
  placeholderLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text)',
  },
  placeholderHint: {
    fontSize: 12,
  },
  materialsList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  materialItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    borderRadius: 4,
  },
  materialThumbFallback: {
    width: 32,
    height: 32,
    borderRadius: 3,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    flexShrink: 0,
  },
  materialName: {
    fontSize: 13,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  video: {
    width: '100%',
    height: '100%',
    maxHeight: '100%',
    background: '#000',
    borderRadius: 4,
    display: 'block',
  },
} satisfies Record<string, CSSProperties>;
