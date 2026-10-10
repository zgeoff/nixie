// oxlint-disable one-var -- spike code, grouped for reading
// nixie's tools over Streamable HTTP on 127.0.0.1: one endpoint on the v1 MCP SDK and one on the v2
// server packages. Both log every exchange with its MCP-Protocol-Version header.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { McpServer as McpServerV2, createMcpHandler } from '@modelcontextprotocol/server';
import { registerTools } from './tools.ts';

export interface McpLog {
  at?: number;
  direction: 'in' | 'out';
  header?: string | null;
  message: unknown;
  via: string;
}

export const mcpLog: McpLog[] = [];

interface Endpoint {
  stop: () => void;
  url: string;
}

async function writeBody(response: Response, entry: McpLog): Promise<void> {
  const text = await response.text();
  entry.message = text.slice(0, 2000);
}

// Logs one HTTP exchange with its protocol header, then returns the response unchanged.
async function writeExchange(
  request: Request,
  via: string,
  serve: (request: Request) => Promise<Response>,
): Promise<Response> {
  const body = request.method === 'POST' ? await request.clone().text() : '';
  mcpLog.push({
    at: Math.round(performance.now()),
    direction: 'in',
    header: request.headers.get('mcp-protocol-version'),
    message: body ? (JSON.parse(body) as unknown) : `${request.method} (no body)`,
    via,
  });
  const response = await serve(request);
  const entry: McpLog = { direction: 'out', header: String(response.status), message: '', via };
  mcpLog.push(entry);

  // A stream response stays open, so its body is logged when it ends, never awaited here.
  void writeBody(response.clone(), entry);
  return response;
}

// A v2 server through createMcpHandler, which serves 2026-07-28 and falls back to stateless
// 2025-era serving for a legacy request.
export function startHttpEndpointV2(): Endpoint {
  const handler = createMcpHandler(() => {
      const mcp = new McpServerV2({ name: 'nixie', version: '0.0.0' });
      registerTools(mcp);
      return mcp;
    }),
    server = Bun.serve({
      fetch: (request) => writeExchange(request, 'http-v2', (inner) => handler.fetch(inner)),
      hostname: '127.0.0.1',
      port: 0,
    });
  return {
    stop() {
      void server.stop(true);
    },
    url: `http://127.0.0.1:${server.port}/mcp`,
  };
}

export function startHttpEndpoint(): Endpoint {
  const server = Bun.serve({
    fetch: (request) =>
      writeExchange(request, 'http', async (inner) => {
        const mcp = new McpServer({ name: 'nixie', version: '0.0.0' }),
          transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
        registerTools(mcp);
        await mcp.connect(transport);
        return transport.handleRequest(inner);
      }),
    hostname: '127.0.0.1',
    port: 0,
  });
  return {
    stop() {
      void server.stop(true);
    },
    url: `http://127.0.0.1:${server.port}/mcp`,
  };
}
