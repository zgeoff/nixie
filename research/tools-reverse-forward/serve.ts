// oxlint-disable one-var -- grouped spike setup
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { startMock } from './mock.ts';

const handler = createMcpHandler(() => {
  const mcp = new McpServer({ name: 'nixie', version: '0.0.0' });
  mcp.registerTool(
    'ping',
    {
      description: 'Return the probe number.',
      inputSchema: { n: z.number() },
      outputSchema: { n: z.number() },
    },
    (input) => {
      console.log(JSON.stringify({ event: 'tool', n: input.n }));
      return { content: [], structuredContent: { n: input.n } };
    },
  );
  return mcp;
});
const mock = startMock();
mock.setTarget('ping', { n: 42 });
const server = Bun.serve({
  hostname: process.env.SPIKE_BIND ?? '127.0.0.1',
  port: Number(process.env.SPIKE_TOOLS_PORT ?? '8793'),
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/bench') {
      return Response.json({ ok: true });
    }
    if (path === '/stream') {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('first\n'));
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode('last\n'));
              controller.close();
            }, 250);
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    }
    if (request.headers.get('authorization') !== `Bearer ${process.env.SPIKE_MCP_TOKEN}`) {
      return new Response('refused', { status: 401 });
    }
    const body =
      request.method === 'POST' ? ((await request.clone().json()) as { method?: string }) : {};
    console.log(
      JSON.stringify({
        event: 'mcp',
        method: body.method ?? request.method,
        revision: request.headers.get('mcp-protocol-version'),
      }),
    );
    return handler.fetch(request);
  },
});
console.log(JSON.stringify({ event: 'listening', toolsPort: server.port }));
