import type { ToolTarget } from '@heynixie/sandbox';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export interface TestToolCall {
  readonly target: ToolTarget;

  readonly token: string;

  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export async function sendTestToolCall(call: TestToolCall): Promise<string> {
  if (!('path' in call.target)) {
    throw new Error('the test endpoint listens on a Unix socket');
  }

  const socketPath = call.target.path;

  const client = new Client(
    { name: 'nixie-test-guest', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );

  // Bun.fetch, because the test preload's request interceptor drops the unix option from fetch
  const sendOverSocket = (url: string | URL, init?: RequestInit) =>
    Bun.fetch(url, { ...init, unix: socketPath });

  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    fetch: sendOverSocket,
    requestInit: { headers: { authorization: `Bearer ${call.token}` } },
  });

  await client.connect(transport);

  try {
    const result = await client.callTool({ name: call.name, arguments: { ...call.input } });

    return JSON.stringify(result);
  } finally {
    await client.close();
  }
}
