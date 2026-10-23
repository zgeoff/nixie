import type { ToolTarget } from '@heynixie/sandbox';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export interface TestToolRoute {
  readonly target: ToolTarget;

  readonly token: string;
}

export async function withTestToolClient<Result>(
  route: TestToolRoute,
  run: (client: Client) => Promise<Result>,
): Promise<Result> {
  if (!('path' in route.target)) {
    throw new Error('the test endpoint listens on a Unix socket');
  }

  const socketPath = route.target.path;

  const client = new Client(
    { name: 'nixie-test-guest', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );

  // Bun.fetch, because the test preload's request interceptor drops the unix option from fetch
  const sendOverSocket = (url: string | URL, init?: RequestInit) =>
    Bun.fetch(url, { ...init, unix: socketPath });

  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    fetch: sendOverSocket,
    requestInit: { headers: { authorization: `Bearer ${route.token}` } },
  });

  await client.connect(transport);

  try {
    return await run(client);
  } finally {
    await client.close();
  }
}
