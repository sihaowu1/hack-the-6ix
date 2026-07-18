import type { CSSProperties } from 'react';

/**
 * One clip on the timeline. `start` and `duration` are in seconds.
 */
export interface TimelineClip {
  id: string;
  /** Label rendered on the block (usually the scene/material name). */
  label: string;
  /** Seconds from the timeline origin (t=0). */
  start: number;
  /** Length of the clip in seconds. Must be > 0. */
  duration: number;
  /** Optional custom fill color; defaults to the accent color. */
  color?: string;
}

export interface TimelineProps {
  clips: TimelineClip[];
  /**
   * Total timeline length in seconds. If omitted, it's derived from the
   * furthest clip end so the layout always fills the track.
   */
  totalDuration?: number;
}

/**
 * V1 timeline: read-only, single horizontal track.
 * Each clip is a positioned block whose left/width is a percentage of the
 * total timeline duration. No drag, no trim, no selection.
 */
export function Timeline({ clips, totalDuration }: TimelineProps) {
  // Derive the visible duration from the clips unless the parent overrides it.
  const derivedEnd = clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
  const total = Math.max(totalDuration ?? derivedEnd, 0.0001);

  if (clips.length === 0) {
    return (
      <div style={styles.empty} aria-label="Timeline">
        <span style={styles.emptyLabel}>No clips yet</span>
        <span style={styles.emptyHint}>Rendered scenes will appear here as clips.</span>
      </div>
    );
  }

  return (
    <div style={styles.root} aria-label="Timeline">
      <Ruler total={total} />
      <div style={styles.track} role="list">
        {clips.map((clip) => {
          // Position and size as percentages of the total timeline length.
          const leftPct = (clip.start / total) * 100;
          const widthPct = (clip.duration / total) * 100;
          return (
            <div
              key={clip.id}
              role="listitem"
              title={`${clip.label} — ${clip.start.toFixed(2)}s → ${(
                clip.start + clip.duration
              ).toFixed(2)}s`}
              style={{
                ...styles.clip,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                background: clip.color ?? 'var(--accent)',
              }}
            >
              <span style={styles.clipLabel}>{clip.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Simple time ruler above the track. Picks a tick interval that yields a
 * readable number of labels (aim for ~6 ticks) so the ruler doesn't get
 * crowded on short timelines or sparse on long ones.
 */
function Ruler({ total }: { total: number }) {
  const step = pickTickStep(total);
  const ticks: number[] = [];
  for (let t = 0; t <= total + 1e-6; t += step) ticks.push(t);

  return (
    <div style={styles.ruler} aria-hidden="true">
      {ticks.map((t) => (
        <span
          key={t}
          style={{
            ...styles.tick,
            left: `${(t / total) * 100}%`,
          }}
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

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    width: '100%',
    height: '100%',
    minHeight: 0,
    padding: 4,
  },
  ruler: {
    position: 'relative',
    height: 16,
    color: 'var(--text-dim)',
    fontSize: 10,
    flexShrink: 0,
  },
  tick: {
    position: 'absolute',
    top: 0,
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
  },
  track: {
    position: 'relative',
    flex: 1,
    minHeight: 40,
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  clip: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    minWidth: 2,
    borderRadius: 3,
    padding: '0 6px',
    display: 'flex',
    alignItems: 'center',
    color: '#0b0d12',
    fontSize: 12,
    fontWeight: 600,
    boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
  },
  clipLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empty: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    color: 'var(--text-dim)',
    border: '1px dashed var(--border)',
    borderRadius: 4,
    padding: 12,
  },
  emptyLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text)',
  },
  emptyHint: {
    fontSize: 12,
  },
} satisfies Record<string, CSSProperties>;
