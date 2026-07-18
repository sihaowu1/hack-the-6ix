import { useState } from 'react';

interface Props {
  busy: string | null;
  onGenerate: (prompt: string) => void;
  onModify: (prompt: string) => void;
}

/**
 * The single prompt input driving the AI agents: "Generate" creates a new
 * scene from the prompt; "Modify" applies the prompt to the current scene.
 */
export function PromptBar({ busy, onGenerate, onModify }: Props) {
  const [prompt, setPrompt] = useState('');
  const disabled = busy !== null || prompt.trim() === '';

  return (
    <header className="prompt-bar">
      <span className="brand">MotionForge</span>
      <input
        type="text"
        value={prompt}
        placeholder='Describe a 3D scene… e.g. "a gold torus knot spinning over a dark floor"'
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !disabled) onGenerate(prompt.trim());
        }}
      />
      <button type="button" disabled={disabled} onClick={() => onGenerate(prompt.trim())}>
        Generate
      </button>
      <button
        type="button"
        className="secondary"
        disabled={disabled}
        onClick={() => onModify(prompt.trim())}
      >
        Modify
      </button>
    </header>
  );
}
