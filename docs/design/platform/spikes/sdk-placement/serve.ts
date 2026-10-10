// Option B, host side: serves nixie's tools as a stateless Streamable HTTP MCP server behind a
// bearer token. It logs each request's method, path and status, never the token.
// Env: NIXIE_MCP_HOST, NIXIE_MCP_PORT, NIXIE_MCP_TOKEN, and what tools.ts reads.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { runTool, toolSpecs } from './tools.ts';

function readToken(): string {
  const value = process.env.NIXIE_MCP_TOKEN;
  if (!value) {
    throw new Error('set NIXIE_MCP_TOKEN');
  }
  return value;
}

function buildServer(): McpServer {
  const server = new McpServer({ name: 'nixie', version: '0.0.0' });
  for (const spec of toolSpecs) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.shape },
      (input) => runTool(spec, input),
    );
  }
  return server;
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.headers.get('authorization') !== `Bearer ${token}`) {
    return new Response('unauthorized\n', { status: 401 });
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await buildServer().connect(transport);
  return transport.handleRequest(request);
}

const server = Bun.serve({
    async fetch(request) {
      const from = server.requestIP(request)?.address,
        response = await handleRequest(request);
      console.log(
        `mcp ${request.method} ${new URL(request.url).pathname} ${response.status} from ${from}`,
      );
      return response;
    },
    hostname: process.env.NIXIE_MCP_HOST,
    port: Number(process.env.NIXIE_MCP_PORT),
  }),
  token = readToken();
console.log(`mcp listening on ${server.url}`);
