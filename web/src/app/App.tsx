import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { useSceneProject } from '../state/useSceneProject';
import { StatusBar } from './StatusBar';
import { Logo } from './Logo';
import { ModelGenerationScreen } from '../screens/ModelGenerationScreen';
import { VideoGenerationScreen } from '../screens/VideoGenerationScreen';
import { ExportScreen } from '../screens/ExportScreen';
import { ChatPanel } from '../chat/ChatPanel';

/**
 * Router shell.
 *
 * `useSceneProject` lives here so both screens share one state instance —
 * per SPEC.md Issue 4, Materials/Video panes must read the same data source
 * as the Model screen's list, or the two screens will drift out of sync.
 *
 * Each screen owns its own chat (`ChatPanel`, with scrollback) rather than a
 * single global prompt bar, so there's no top-level `PromptBar` mounted here
 * anymore — see `PromptBar.tsx`'s doc comment.
 */
export function App() {
  const project = useSceneProject();

  return (
    <div className="app">
      <TopNav />
      <div style={styles.outlet}>
        <Routes>
          <Route path="/" element={<Navigate to="/model" replace />} />
          <Route path="/model" element={<ModelGenerationScreen project={project} />} />
          <Route
            path="/video"
            element={
              <VideoGenerationScreen
                models={project.models}
                activeModelId={project.activeModelId}
                code={project.code}
                tunables={project.tunables}
                onParamChange={project.setParam}
                mp4Job={project.mp4Job}
                clips={project.clips}
                chat={
                  <ChatPanel
                    busy={project.busy}
                    status={project.status}
                    onGenerate={project.generate}
                    onModify={project.modify}
                  />
                }
              />
            }
          />
          <Route
            path="/export"
            element={
              <ExportScreen
                models={project.models}
                activeModelId={project.activeModelId}
                code={project.code}
                tunables={project.tunables}
                onParamChange={project.setParam}
                mp4Job={project.mp4Job}
              />
            }
          />
          <Route path="*" element={<Navigate to="/model" replace />} />
        </Routes>
      </div>
      <StatusBar busy={project.busy} status={project.status} />
    </div>
  );
}

function TopNav() {
  return (
    <div style={styles.navWrap}>
      <div style={styles.brand}>
        <Logo />
        <span style={styles.brandName}>Zendai</span>
      </div>
      <nav style={styles.nav} aria-label="Screens">
        <NavLink to="/model" style={navLinkStyle}>
          Model
        </NavLink>
        <NavLink to="/video" style={navLinkStyle}>
          Video
        </NavLink>
        <NavLink to="/export" style={navLinkStyle}>
          Export
        </NavLink>
      </nav>
    </div>
  );
}

function navLinkStyle({ isActive }: { isActive: boolean }): CSSProperties {
  return {
    padding: '6px 12px',
    borderRadius: 4,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    color: isActive ? 'var(--text)' : 'var(--text-dim)',
    background: isActive ? 'var(--bg-raised)' : 'transparent',
    border: `1px solid ${isActive ? 'var(--border)' : 'transparent'}`,
  };
}

const styles = {
  navWrap: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 14px 8px',
    color: 'var(--text)',
  },
  brandName: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.01em',
  },
  nav: {
    display: 'flex',
    gap: 6,
    padding: '0 14px 8px',
  },
  outlet: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
} satisfies Record<string, CSSProperties>;
