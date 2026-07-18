import { useState } from 'react';
import { useSceneProject } from '../state/useSceneProject';
import { PromptBar } from './PromptBar';
import { StatusBar } from './StatusBar';
import { ControlsPanel } from '../controls/ControlsPanel';
import { ExportPanel } from '../export/ExportPanel';
import { BlenderPanel } from '../blender/BlenderPanel';
import { Viewport } from '../viewport/Viewport';
import { EditorTabs, type EditorTab } from '../editor/EditorTabs';

export function App() {
  const project = useSceneProject();
  const [tab, setTab] = useState<EditorTab>('scene');

  return (
    <div className="app">
      <PromptBar busy={project.busy} onGenerate={project.generate} onModify={project.modify} />
      <main className="workspace">
        <aside className="sidebar">
          <ControlsPanel tunables={project.tunables} onChange={project.setParam} />
          <ExportPanel
            busy={project.busy}
            mp4Job={project.mp4Job}
            onExportCode={project.exportCode}
            onExportMp4={project.exportMp4}
          />
          <BlenderPanel
            status={project.blenderStatus}
            busy={project.busy}
            onSync={project.syncBlender}
            onAgent={project.runBlenderAgent}
          />
        </aside>
        <Viewport code={project.code} />
        <section className="editor-pane">
          <EditorTabs
            tab={tab}
            onTabChange={setTab}
            sceneCode={project.code}
            blenderCode={project.blenderCode}
            onSceneChange={project.setCode}
            onBlenderChange={project.setBlenderCode}
          />
        </section>
      </main>
      <StatusBar busy={project.busy} status={project.status} />
    </div>
  );
}
