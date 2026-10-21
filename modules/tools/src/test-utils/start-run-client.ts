import { onTestFinished } from 'bun:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { RunEndpoint } from '../types';

export async function startRunClient(
  endpoint: RunEndpoint,
  token: string = endpoint.token,
): Promise<Client> {
  const socketPath = endpoint.socketPath;

  const client = new Client(
    { name: 'nixie-test', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );

  // Bun.fetch, because the test preload's request interceptor drops the unix option from fetch
  const sendOverSocket = (url: string | URL, init?: RequestInit) =>
    Bun.fetch(url, { ...init, unix: socketPath });

  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    fetch: sendOverSocket,
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });

  await client.connect(transport);

  onTestFinished(() => client.close());

  return client;
}
