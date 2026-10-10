// nixie's tools on the host: a stateless Streamable HTTP MCP server behind a bearer token, with 3
// stub tools. The path picks how many it lists (/mcp/1, /mcp/3). It logs paths, never the token.
// Env: NIXIE_MCP_HOST, NIXIE_MCP_PORT, NIXIE_MCP_TOKEN.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';

interface StubTool {
  description: string;
  name: string;
  run: (input: Record<string, string>) => string;
  shape: Record<string, z.ZodString>;
}

function readToken(): string {
  const value = process.env.NIXIE_MCP_TOKEN;
  if (!value) {
    throw new Error('set NIXIE_MCP_TOKEN');
  }
  return value;
}

function buildServer(count: number): McpServer {
  const server = new McpServer({ name: 'nixie', version: '0.0.0' });
  for (const spec of stubTools.slice(0, count)) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.shape },
      (input: Record<string, string>) => ({
        content: [{ text: spec.run(input), type: 'text' as const }],
      }),
    );
  }
  return server;
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${token}`) {
    return new Response('unauthorized\n', { status: 401 });
  }
  const count = Number(new URL(request.url).pathname.split('/')[2]),
    transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  if (!Number.isInteger(count) || count < 1 || count > stubTools.length) {
    return new Response('not found\n', { status: 404 });
  }
  await buildServer(count).connect(transport);
  return transport.handleRequest(request);
}

const server = Bun.serve({
    async fetch(request) {
      const response = await handleRequest(request);
      console.log(`mcp ${request.method} ${new URL(request.url).pathname} ${response.status}`);
      return response;
    },
    hostname: process.env.NIXIE_MCP_HOST,
    port: Number(process.env.NIXIE_MCP_PORT),
  }),
  stubTools: StubTool[] = [
    {
      description: 'Read the note with this name and return its text.',
      name: 'read_note',
      run: (input) => `note ${input.name ?? ''} is empty`,
      shape: { name: z.string().describe('The note name, such as plan.md') },
    },
    {
      description: 'Write text to the note with this name, replacing any note of that name.',
      name: 'write_note',
      run: (input) => `wrote ${input.name ?? ''}`,
      shape: {
        name: z.string().describe('The note name, such as plan.md'),
        text: z.string().describe('The whole text of the note'),
      },
    },
    {
      description:
        'Run a POSIX shell snippet in a throwaway sandbox and return its exit code and output.',
      name: 'run_code',
      run: () => 'exit 0\nstdout:\n\nstderr:\n',
      shape: { code: z.string().describe('The shell snippet') },
    },
  ],
  token = readToken();
console.log(`mcp listening on ${server.url}`);
