import { CodeEditor } from './CodeEditor';

export type EditorTab = 'scene' | 'blender';

interface Props {
  tab: EditorTab;
  onTabChange: (tab: EditorTab) => void;
  sceneCode: string;
  blenderCode: string;
  onSceneChange: (code: string) => void;
  onBlenderChange: (code: string) => void;
}

/** Two editable documents: the Three.js scene module and the Blender script. */
export function EditorTabs({
  tab,
  onTabChange,
  sceneCode,
  blenderCode,
  onSceneChange,
  onBlenderChange,
}: Props) {
  return (
    <div className="editor-tabs">
      <div className="tab-strip">
        <button
          type="button"
          className={tab === 'scene' ? 'tab active' : 'tab'}
          onClick={() => onTabChange('scene')}
        >
          scene.module.js
        </button>
        <button
          type="button"
          className={tab === 'blender' ? 'tab active' : 'tab'}
          onClick={() => onTabChange('blender')}
        >
          scene.blender.py
        </button>
      </div>
      {tab === 'scene' ? (
        <CodeEditor value={sceneCode} language="javascript" onChange={onSceneChange} />
      ) : (
        <CodeEditor value={blenderCode} language="python" onChange={onBlenderChange} />
      )}
    </div>
  );
}
