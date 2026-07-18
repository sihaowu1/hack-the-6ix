import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null | undefined;

/**
 * Lazily constructed Anthropic client. Returns null when no ANTHROPIC_API_KEY
 * is configured, in which case callers fall back to the offline template
 * generator (agents/templateFallback).
 */
export function getAnthropicClient(): Anthropic | null {
  if (client === undefined) {
    client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  }
  return client;
}

export function aiAvailable(): boolean {
  return getAnthropicClient() !== null;
}
