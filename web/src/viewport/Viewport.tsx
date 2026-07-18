import { useEffect, useRef, useState } from 'react';
import { SceneRuntime } from './SceneRuntime';

interface Props {
  code: string;
}

/**
 * The WebGL preview panel. Debounces code changes (typing, slider drags, AI
 * output) and hot-reloads them into the SceneRuntime.
 */
export function Viewport({ code }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const runtime = new SceneRuntime(canvasRef.current);
    runtime.onError = (err) => setError(err.message);
    runtimeRef.current = runtime;
    const observer = new ResizeObserver(([entry]) => {
      runtime.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setError(null);
      runtimeRef.current
        ?.setCode(code)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [code]);

  return (
    <div className="viewport" ref={containerRef}>
      <canvas ref={canvasRef} />
      {error && <div className="viewport-error">{error}</div>}
    </div>
  );
}
