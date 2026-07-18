import { useEffect, useMemo, useRef, useState } from 'react';
import { fuseSlugs } from '@motionforge/shared';
import { ChatPanel } from '../ChatPanel';
import { ControlsFloater } from '../controls/ControlsFloater';
import { ResizeHandle } from '../layout/ResizeHandle';
import { useResizable } from '../layout/useResizable';
import { ModelsLayersList } from '../ModelsLayersList';
import type { useSceneProject } from '../../state/useSceneProject';
import type { ObjectHandle } from '../../viewport/SceneRuntime';
import { Viewport } from '../../viewport/Viewport';
import { PANEL_HEADER } from '../ui/Panel';

interface Props {
  project: ReturnType<typeof useSceneProject>;
}

interface ClickSelection {
  anchor: { x: number; y: number };
  handle: ObjectHandle;
}

/**
 * Screen 1 — Model Generation.
 *
 *   +------------------+---------------------------+
 *   | Chat             |                           |
 *   | (top-left)       |                           |
 *   +------------------+   3D Viewport             |
 *   | Models & Layers  |   (full right column)     |
 *   | (bottom-left)    |                           |
 *   +------------------+---------------------------+
 *
 * The left column is chat (scrollback, drives generate/modify) over the
 * Models & Layers list; both read/write `useSceneProject`, which is lifted
 * to `App` so this stays in sync with the Video screen's Materials pane.
 * Clicking a model row activates it (for the viewport). Shift-click adds to a
 * multi-select; Merge Selected snapshots those models into an independent
 * fused copy. The tunable controls floater opens from clicking the model in
 * the viewport (raycast); merge child roots also expose TransformControls
 * that persist into `{slug}_offset*` PARAMS on close.
 */
export function ModelGenerationScreen({ project }: Props) {
  const [selection, setSelection] = useState<ClickSelection | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const activeModel = project.models.find((m) => m.id === project.activeModelId);

  const leftWidth = useResizable({
    direction: 'horizontal',
    initial: 380,
    min: 300,
    max: 640,
    storageKey: 'motionforge:model-screen:left-width',
  });
  const chatHeight = useResizable({
    direction: 'vertical',
    initial: 320,
    min: 140,
    max: 800,
    storageKey: 'motionforge:model-screen:chat-height',
  });

  const childSlugById = useMemo(() => {
    const children = activeModel?.children;
    if (!children?.length) return new Map<string, string>();
    const slugs = fuseSlugs(children.map((c) => c.name));
    const map = new Map<string, string>();
    for (let i = 0; i < children.length; i++) {
      map.set(slugs[i], children[i].id);
    }
    return map;
  }, [activeModel?.children]);

  const childSlugByIdRef = useRef(childSlugById);
  childSlugByIdRef.current = childSlugById;
  const setParamRef = useRef(project.setParam);
  setParamRef.current = project.setParam;

  const persistMergeOffsets = (handle: ObjectHandle) => {
    const name = handle.objectName;
    if (!name?.startsWith('merge:') || !handle.getLayoutOffsets) return;
    const slug = name.slice('merge:'.length);
    if (!childSlugByIdRef.current.has(slug)) return;
    const offsets = handle.getLayoutOffsets();
    if (!offsets) return;
    setParamRef.current(`${slug}_offsetX`, offsets.x);
    setParamRef.current(`${slug}_offsetY`, offsets.y);
    setParamRef.current(`${slug}_offsetZ`, offsets.z);
    setParamRef.current(`${slug}_yaw`, offsets.angle);
  };

  const closeFloater = () => {
    const current = selectionRef.current;
    if (current) persistMergeOffsets(current.handle);
    setSelection(null);
  };

  // Selecting a different top-level model closes the floater (after persist).
  useEffect(() => {
    const current = selectionRef.current;
    if (current) persistMergeOffsets(current.handle);
    setSelection(null);
  }, [project.activeModelId]);

  const floaterTitle = project.focusedChild?.name ?? activeModel?.name ?? 'Model';

  return (
    <main
      className="grid min-h-0 flex-1 grid-cols-[var(--model-left-w)_1px_1fr]"
      style={{ ['--model-left-w' as string]: `${leftWidth.size}px` }}
    >
      <div className="flex min-h-0 min-w-0 flex-col bg-bg-panel">
        <section
          className="flex min-h-0 flex-none flex-col p-3"
          aria-label="Chat"
          style={{ height: chatHeight.size }}
        >
          <ChatPanel
            busy={project.busy}
            status={project.status}
            onGenerate={project.generate}
            onModify={project.modify}
          />
        </section>
        <ResizeHandle direction="vertical" onPointerDown={chatHeight.startDragging} label="Resize chat panel" />
        <section className="flex min-h-0 flex-1 flex-col gap-2 p-3" aria-label="Models & Layers">
          <h2
            className={`flex-shrink-0 ${PANEL_HEADER}`}
            title="Click to select a model. Shift-click to select several and merge them."
          >
            Models &amp; Layers
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ModelsLayersList
              models={project.models}
              activeModelId={project.activeModelId}
              selectedModelIds={project.selectedModelIds}
              focusedChildId={project.focusedChildId}
              onSelectModel={project.selectModel}
              onFocusMergeChild={project.focusMergeChild}
              onMergeSelected={project.mergeSelectedModels}
              onRenameModel={project.renameModel}
              onRenameLayer={project.renameModelLayer}
              onDeleteLayer={project.deleteModelLayer}
              onRenameMergeChildLayer={project.renameMergeChildLayer}
              onDeleteMergeChildLayer={project.deleteMergeChildLayer}
            />
          </div>
        </section>
      </div>
      <ResizeHandle direction="horizontal" onPointerDown={leftWidth.startDragging} label="Resize sidebar" />
      <Viewport
        scenes={project.viewportScenes}
        onModelClick={(anchor, handle) => {
          setSelection({ anchor, handle });
          const name = handle.objectName;
          if (name?.startsWith('merge:') && activeModel?.children?.length) {
            const slug = name.slice('merge:'.length);
            const childId = childSlugById.get(slug);
            if (childId) {
              project.focusMergeChild(activeModel.id, childId);
              return;
            }
          }
          if (activeModel?.children?.length) {
            project.focusMergeChild(activeModel.id, null);
          }
        }}
        showToolbar
      />
      {selection && (
        <ControlsFloater
          anchor={selection.anchor}
          title={floaterTitle}
          objectHandle={selection.handle}
          tunables={project.tunables}
          onChange={project.setParam}
          onClose={closeFloater}
        />
      )}
    </main>
  );
}
