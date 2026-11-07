// A stub MCP server over HTTP on port 8901, with one tool that returns about 40 KB of text, so a
// tool loop fills the context the way nixie's own tools do.
const filler = 'The ledger lists one more crate of pears for the north dock. '.repeat(650);

Bun.serve({ port: 8901, fetch: answerRequest });

async function answerRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const body: unknown = await request.json();

  if (typeof body !== 'object' || body === null || !('method' in body)) {
    return new Response(null, { status: 400 });
  }

  const id = 'id' in body ? body.id : null;

  if (id === null) {
    return new Response(null, { status: 202 });
  }

  return Response.json({ jsonrpc: '2.0', id, result: buildResult(String(body.method)) });
}

function buildResult(method: string): object {
  if (method === 'initialize') {
    return {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'stub', version: '0.0.0' },
    };
  }

  if (method === 'tools/list') {
    return {
      tools: [
        {
          name: 'read_ledger',
          description: 'Read one page of the dock ledger.',
          inputSchema: {
            type: 'object',
            properties: { page: { type: 'number' } },
            required: ['page'],
          },
        },
      ],
    };
  }

  if (method === 'tools/call') {
    return { content: [{ type: 'text', text: filler }] };
  }

  return {};
}
