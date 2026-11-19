import { Server, createMcpHandler } from '@modelcontextprotocol/server';

export interface ListedTool {
  readonly name: string;
  readonly description: string;
  readonly input: Record<string, unknown>;
}

export interface ToolServer {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

// Starts nixie's tool route as the guest reaches it: a Streamable HTTP MCP server named nixie at
// /mcp that lists each tool as the run's endpoint does.
export function startToolServer(tools: readonly ListedTool[]): ToolServer {
  const handler = createMcpHandler(() => buildServer(tools));
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,

    // the MCP client holds a stream open between calls
    idleTimeout: 0,
    fetch: answerRequest,
  });

  function answerRequest(request: Request): Promise<Response> {
    return handler.fetch(request);
  }

  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: async () => {
      await handler.close();
      await server.stop(true);
    },
  };
}

function buildServer(tools: readonly ListedTool[]): Server {
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
  // one fixed result for every call, so a run that calls a tool shows how the CLI wraps its result
  server.setRequestHandler('tools/call', () => ({
    content: [{ type: 'text', text: '{"now":"2026-11-19T10:00:00Z","zone":"Europe/Lisbon"}' }],
  }));

  return server;
}
