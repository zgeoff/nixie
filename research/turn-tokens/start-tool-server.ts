import type { McpHttpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { Server, createMcpHandler } from '@modelcontextprotocol/server';

export interface ListedTool {
  readonly name: string;
  readonly description: string;
  readonly input: Record<string, unknown>;
}

export interface ToolServer {
  readonly config: McpHttpServerConfig;

  // the name of each tool the model called, in order
  readonly calls: string[];
  readonly stop: () => Promise<void>;
}

// Starts nixie's tool server as the guest reaches it: a Streamable HTTP MCP server named nixie that
// lists each tool by its name, description and input schema, as the run's endpoint does, and
// answers each call with the scripted text for its tool.
export function startToolServer(
  tools: readonly ListedTool[],
  answer: (name: string, input: Record<string, unknown>) => string,
): ToolServer {
  const calls: string[] = [];
  const handler = createMcpHandler(() => buildServer(tools, answer, calls));
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,

    // the MCP client holds a stream open between calls
    idleTimeout: 0,
    fetch: (request) => handler.fetch(request),
  });

  return {
    config: { type: 'http', url: `http://127.0.0.1:${server.port}/mcp`, alwaysLoad: true },
    calls,
    stop: async () => {
      await handler.close();
      await server.stop(true);
    },
  };
}

function buildServer(
  tools: readonly ListedTool[],
  answer: (name: string, input: Record<string, unknown>) => string,
  calls: string[],
): Server {
  const server = new Server(
    { name: 'nixie', version: '0.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler('tools/list', () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: { ...tool.input, type: 'object' as const },
    })),
  }));
  server.setRequestHandler('tools/call', (request) => {
    calls.push(request.params.name);
    return {
      content: [
        {
          type: 'text',
          text: answer(request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>),
        },
      ],
    };
  });
  return server;
}
