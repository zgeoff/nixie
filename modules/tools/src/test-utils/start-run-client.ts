import { onTestFinished } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { RunEndpoint } from '../types';

// Connects an MCP client to a run's endpoint over its Unix socket with the run's bearer token, on
// MCP revision 2026-07-28 as Claude Code speaks it. The test's end closes the client.
export async function startRunClient(endpoint: RunEndpoint): Promise<Client> {
  const socketPath = endpoint.socketPath;
  const client = new Client(
    { name: 'nixie-test', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    // Bun.fetch, because the test preload's request interceptor drops the unix option from fetch
    fetch: (url, init) => Bun.fetch(url, { ...init, unix: socketPath }),
    requestInit: { headers: { authorization: `Bearer ${endpoint.token}` } },
  });

  await client.connect(transport);
  onTestFinished(() => client.close());
  return client;
}
