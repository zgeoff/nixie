import type { McpHttpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { Server, createMcpHandler } from '@modelcontextprotocol/server';

export interface ToolServer {
  readonly config: McpHttpServerConfig;
  readonly stop: () => Promise<void>;
}

// Starts a Streamable HTTP MCP server named nixie with no tools. The guest refuses a turn whose tool
// server does not connect, and an empty list keeps a tool call out of every answer.
export function startEmptyToolServer(): ToolServer {
  const handler = createMcpHandler(() => buildServer());
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,

    // the MCP client holds a stream open between calls
    idleTimeout: 0,
    fetch: (request) => handler.fetch(request),
  });

  return {
    config: { type: 'http', url: `http://127.0.0.1:${server.port}/mcp`, alwaysLoad: true },
    stop: async () => {
      await handler.close();
      await server.stop(true);
    },
  };
}

function buildServer(): Server {
  const server = new Server({ name: 'nixie', version: '0.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler('tools/list', () => ({ tools: [] }));

  return server;
}
