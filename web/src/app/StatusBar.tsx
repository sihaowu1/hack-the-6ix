import type { Status } from '../state/useSceneProject';

interface Props {
  busy: string | null;
  status: Status | null;
}

export function StatusBar({ busy, status }: Props) {
  if (busy) {
    return <footer className="status-bar busy">{busy}</footer>;
  }
  if (status) {
    return <footer className={`status-bar ${status.kind}`}>{status.text}</footer>;
  }
  return (
    <footer className="status-bar">
      Ready — edit the code, drag a slider, or prompt the AI.
    </footer>
  );
}
