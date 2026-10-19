import type { ToolTarget } from '@heynixie/sandbox';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export interface TestToolCall {
  // where the run's endpoint listens
  readonly target: ToolTarget;

  // the bearer token the turn frame carries
  readonly token: string;

  // the tool's name as the endpoint serves it
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

// Calls a tool on a run's endpoint over its Unix socket, as the guest's SDK does through the
// sandbox's route, and returns the result as JSON text. It reaches no endpoint on a port.
export async function sendTestToolCall(call: TestToolCall): Promise<string> {
  if (!('path' in call.target)) {
    throw new Error('the test endpoint listens on a Unix socket');
  }

  const socketPath = call.target.path;

  const client = new Client(
    { name: 'nixie-test-guest', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );

  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    // Bun.fetch, because the test preload's request interceptor drops the unix option from fetch
    fetch: (url, init) => Bun.fetch(url, { ...init, unix: socketPath }),
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
