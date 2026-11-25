import type { CredentialFetch } from '@heynixie/credentials';
import type { JSONObject } from '@heynixie/log';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { buildClient } from '../listing/build-client';

export interface ServerCallRequest {
  readonly url: string;

  // sends each request with the server's access token added
  readonly send: CredentialFetch;

  // the server's own name for the tool, before the prefix
  readonly name: string;
  readonly input: JSONObject;
  readonly timeoutMs: number;
}

export type ServerCallOutcome =
  | { readonly kind: 'answered'; readonly answer: unknown }
  | { readonly kind: 'failed'; readonly message: string };

// One MCP tools/call of one server, over Streamable HTTP, through the credential store's fetcher.
// A call that fails is a value, never a throw, and its message never holds the server's text.
export async function runServerCall(request: ServerCallRequest): Promise<ServerCallOutcome> {
  const client = buildClient();

  const transport = new StreamableHTTPClientTransport(new URL(request.url), {
    fetch: request.send,
    redirectPolicy: 'same-origin',
  });

  const signal = AbortSignal.timeout(request.timeoutMs);

  try {
    await client.connect(transport, { signal });

    const answer = await client.callTool(
      { name: request.name, arguments: request.input },
      { signal },
    );

    return { kind: 'answered', answer };
  } catch (error) {
    return {
      kind: 'failed',
      message: error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'failed',
    };
  } finally {
    await client.close().catch(() => null);
  }
}
