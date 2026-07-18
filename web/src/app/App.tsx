import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
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
    <div className="flex h-full flex-col">
      <TopNav />
      <div className="flex min-h-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<Navigate to="/model" replace />} />
          <Route path="/model" element={<ModelGenerationScreen project={project} />} />
          <Route
            path="/video"
            element={
              <VideoGenerationScreen
                models={project.models}
                tunables={project.tunables}
                onParamChange={project.setParam}
                mp4Job={project.mp4Job}
                timelineClips={project.timelineClips}
                timelineTotal={project.timelineTotal}
                playback={project.playback}
                previewCode={project.previewCode}
                previewTime={project.previewTime}
                previewModelName={project.previewModelName}
                onDropModel={project.addClipAtSecond}
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
                tunables={project.tunables}
                onParamChange={project.setParam}
                mp4Job={project.mp4Job}
                timelineClips={project.timelineClips}
                timelineTotal={project.timelineTotal}
                playback={project.playback}
                previewCode={project.previewCode}
                previewTime={project.previewTime}
                previewModelName={project.previewModelName}
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
    <div className="flex flex-shrink-0 items-center gap-5 border-b border-border bg-bg-panel px-4 py-2.5">
      <Link to="/" className="flex items-center gap-2 text-text no-underline hover:opacity-80">
        <Logo size={26} />
        <span className="text-[18px] font-semibold tracking-wide">Zendai</span>
      </Link>
      <nav className="flex gap-1" aria-label="Screens">
        <NavLink to="/model" className={navLinkClassName}>
          Model
        </NavLink>
        <NavLink to="/video" className={navLinkClassName}>
          Video
        </NavLink>
        <NavLink to="/export" className={navLinkClassName}>
          Export
        </NavLink>
      </nav>
    </div>
  );
}

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return `rounded-md px-3 py-1.5 text-[13px] font-medium no-underline transition-colors ${
    isActive ? 'text-text bg-bg-raised' : 'text-text-dim bg-transparent hover:text-text hover:bg-bg-raised/60'
  }`;
}
