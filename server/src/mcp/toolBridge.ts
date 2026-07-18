import type Anthropic from '@anthropic-ai/sdk';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Converts the Blender MCP server's tool list into Anthropic tool definitions
 * so Claude can call Blender directly inside its agent loop.
 */
export async function mcpToolsForAnthropic(client: Client): Promise<Anthropic.Tool[]> {
  const { tools } = await client.listTools();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
  }));
}
