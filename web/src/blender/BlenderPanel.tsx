import { useState } from 'react';
import type { BlenderStatus } from '../api/client';

interface Props {
  status: BlenderStatus | null;
  busy: string | null;
  onSync: () => void;
  onAgent: (prompt: string) => void;
}

/**
 * Blender MCP integration: shows connection state, sends the current Blender
 * script to the live Blender instance, and lets the AI agent drive Blender
 * iteratively through MCP tools.
 */
export function BlenderPanel({ status, busy, onSync, onAgent }: Props) {
  const [agentPrompt, setAgentPrompt] = useState('');
  const connected = status?.connected === true;
  const enabled = status?.enabled === true;
  const dotClass = connected ? 'dot connected' : enabled ? 'dot waiting' : 'dot off';

  return (
    <section className="panel">
      <h2>
        <span className={dotClass} /> Blender (MCP)
      </h2>
      {!enabled && (
        <p className="hint">
          Disabled. Set <code>BLENDER_MCP_ENABLED=true</code>, install the bridge add-on in
          Blender, and restart the server.
        </p>
      )}
      {enabled && !connected && (
        <p className="hint">
          Enabled but not connected — start the MotionForge bridge in Blender (N-panel →
          MotionForge → Start bridge).
        </p>
      )}
      {connected && <p className="hint">Connected. Tools: {status?.tools.join(', ')}</p>}

      <button type="button" disabled={!connected || busy !== null} onClick={onSync}>
        Send scene to Blender
      </button>

      <div className="agent-row">
        <input
          type="text"
          value={agentPrompt}
          placeholder="Ask the agent to build in Blender…"
          onChange={(event) => setAgentPrompt(event.target.value)}
        />
        <button
          type="button"
          disabled={!connected || busy !== null || agentPrompt.trim() === ''}
          onClick={() => onAgent(agentPrompt.trim())}
        >
          Run agent
        </button>
      </div>
    </section>
  );
}
