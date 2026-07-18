import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { config } from '../config';
import { repoRoot } from '../utils/fsx';
import { log, warn } from '../utils/logger';

/**
 * MCP client for Blender. Spawns the Python MCP server (blender/mcp/server.py)
 * over stdio; that server forwards tool calls to the MotionForge bridge add-on
 * running inside Blender over a local TCP socket.
 */

let clientPromise: Promise<Client | null> | null = null;

export function isBlenderEnabled(): boolean {
  return config.blender.enabled;
}

export async function getBlenderMcp(): Promise<Client | null> {
  if (!config.blender.enabled) return null;
  if (!clientPromise) clientPromise = connect();
  return clientPromise;
}

async function connect(): Promise<Client | null> {
  try {
    const transport = new StdioClientTransport({
      command: config.blender.mcp.command,
      args: config.blender.mcp.args,
      cwd: repoRoot,
      env: {
        ...(process.env as Record<string, string>),
        MOTIONFORGE_BRIDGE_HOST: config.blender.mcp.bridgeHost,
        MOTIONFORGE_BRIDGE_PORT: String(config.blender.mcp.bridgePort),
      },
    });
    const client = new Client({ name: 'motionforge-server', version: '0.1.0' });
    await client.connect(transport);
    log('mcp', 'connected to the Blender MCP server');
    return client;
  } catch (err) {
    warn('mcp', `failed to start the Blender MCP server: ${err instanceof Error ? err.message : err}`);
    clientPromise = null;
    return null;
  }
}

/** Calls one MCP tool and returns its text output (throws on tool error). */
export async function callBlenderTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  const text = content
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
  if (result.isError) throw new Error(text || `Blender tool ${name} failed`);
  return text;
}

/** Convenience wrapper: run a Python script inside Blender. */
export async function runBlenderCode(code: string): Promise<string> {
  const client = await getBlenderMcp();
  if (!client) {
    throw new Error(
      'Blender MCP is disabled or unreachable. Set BLENDER_MCP_ENABLED=true and start the bridge add-on in Blender.',
    );
  }
  return callBlenderTool(client, 'execute_blender_code', { code });
}

export interface BlenderStatus {
  enabled: boolean;
  connected: boolean;
  tools: string[];
}

export async function blenderStatus(): Promise<BlenderStatus> {
  if (!config.blender.enabled) return { enabled: false, connected: false, tools: [] };
  const client = await getBlenderMcp();
  if (!client) return { enabled: true, connected: false, tools: [] };
  try {
    const { tools } = await client.listTools();
    return { enabled: true, connected: true, tools: tools.map((tool) => tool.name) };
  } catch {
    return { enabled: true, connected: false, tools: [] };
  }
}
