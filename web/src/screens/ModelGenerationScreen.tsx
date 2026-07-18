import { useState } from 'react';
import { BlenderPanel } from '../blender/BlenderPanel';
import { ControlsPanel } from '../controls/ControlsPanel';
import { EditorTabs, type EditorTab } from '../editor/EditorTabs';
import { ExportPanel } from '../export/ExportPanel';
import type { useSceneProject } from '../state/useSceneProject';
import { Viewport } from '../viewport/Viewport';

interface Props {
  project: ReturnType<typeof useSceneProject>;
}

/**
 * Screen 1 — Model Generation.
 *
 * The original single-screen workspace: sidebar (controls / export / blender),
 * live Three.js viewport, and the scene/Blender code editor. State comes from
 * `useSceneProject`, which is lifted to `App` so both screens share it.
 */
export function ModelGenerationScreen({ project }: Props) {
  const [tab, setTab] = useState<EditorTab>('scene');

  return (
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
  );
}
