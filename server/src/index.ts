import { createApp } from './app';
import { config } from './config';
import { log } from './utils/logger';

const app = createApp();

const server = app.listen(config.server.port, () => {
  log('server', `Zendai server listening on http://localhost:${config.server.port}`);
  log(
    'server',
    process.env.OPENROUTER_API_KEY
      ? `AI agents: Anthropic API (${config.ai.model})`
      : 'AI agents: offline template fallback (set OPENROUTER_API_KEY in .env for AI generation)',
  );
  log(
    'server',
    config.blender.enabled
      ? 'Blender MCP: enabled (will connect on first use)'
      : 'Blender MCP: disabled (set BLENDER_MCP_ENABLED=true to enable)',
  );
});

function shutdown(signal: NodeJS.Signals): void {
  log('server', `${signal} received, shutting down`);
  server.close(() => process.exit(0));
  // Force-exit if a lingering connection (or the Blender MCP child process) blocks a clean close.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
