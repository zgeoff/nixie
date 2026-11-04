import { Server, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';

export interface ToolServer {
  readonly url: string;

  // each JSON-RPC message the MCP client sent, read before the MCP SDK parses it
  readonly requests: unknown[];
  readonly stop: () => Promise<void>;
}

const notes: Readonly<Record<string, string>> = {
  boat: 'The blue rowing boat is moored at the north jetty.',
  garden: 'The tomato bed needs water on Thursdays.',
  slow: 'The slow note arrived after a long wait.',
};

const findNoteInput = z.object({ topic: z.string() });

// Starts the tool server the Codex guest reaches as `nixie`: a Streamable HTTP MCP server with one
// tool, `find_note`. A call for the topic `slow` waits `slowMs` before it answers, so a test can act
// while the tool call is open.
export function startToolServer(slowMs: number): ToolServer {
  const requests: unknown[] = [];
  const handler = createMcpHandler(() => buildServer(slowMs));
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,

    // the MCP client holds a stream open between calls
    idleTimeout: 0,
    fetch: answerRequest,
  });

  async function answerRequest(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      requests.push({
        authorization: request.headers.has('authorization') ? 'present' : 'absent',
        body: await request.clone().json(),
      });
    }
    return handler.fetch(request);
  }

  return {
    url: `http://127.0.0.1:${server.port}/mcp`,
    requests,
    stop: async () => {
      await handler.close();
      await server.stop(true);
    },
  };
}

function buildServer(slowMs: number): Server {
  const server = new Server(
    { name: 'nixie', version: '0.0.0' },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'find_note',
        description: 'Returns the note saved under one topic.',
        inputSchema: {
          type: 'object' as const,
          properties: { topic: { type: 'string' } },
          required: ['topic'],
        },
      },
    ],
  }));
  server.setRequestHandler('tools/call', async (request) => {
    const { topic } = findNoteInput.parse(request.params.arguments ?? {});

    if (topic === 'slow') {
      await Bun.sleep(slowMs);
    }
    return { content: [{ type: 'text', text: notes[topic] ?? `No note is saved under ${topic}.` }] };
  });
  return server;
}
