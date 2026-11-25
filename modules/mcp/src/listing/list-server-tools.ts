import type { CredentialFetch } from '@heynixie/credentials';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { jsonSchemaValidator } from '@modelcontextprotocol/client';
import { parseToolForm } from '../pin/parse-tool-form';
import type { ToolForm } from '../types';

export interface ListRequest {
  readonly url: string;

  // sends each request with the server's access token added
  readonly send: CredentialFetch;

  // bounds the whole listing: the connection and every page of it together
  readonly timeoutMs: number;
}

export type ListOutcome =
  | { readonly kind: 'listed'; readonly forms: readonly ToolForm[] }
  | { readonly kind: 'failed'; readonly message: string };

// The proxy checks each result against the pinned output schema itself, so the client accepts every
// result and never reads a listing's schema as a check of its own.
const acceptAnyResult: jsonSchemaValidator = {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the validator's result type is generic over the schema, and this one passes the input through
  getValidator: () => (input) => ({ valid: true, data: input as never, errorMessage: undefined }),
};

// One MCP `tools/list` of one server, over Streamable HTTP with no sampling, roots, logging or
// input-request capability. A listing that fails for any reason is a failure value, never a throw.
export async function listServerTools(request: ListRequest): Promise<ListOutcome> {
  const client = new Client(
    { name: 'nixie', version: '0.0.0' },
    { jsonSchemaValidator: acceptAnyResult, versionNegotiation: { mode: 'auto' } },
  );

  const transport = new StreamableHTTPClientTransport(new URL(request.url), {
    fetch: request.send,
    redirectPolicy: 'same-origin',
  });

  const signal = AbortSignal.timeout(request.timeoutMs);

  try {
    await client.connect(transport, { signal });

    const forms: ToolForm[] = [];
    let cursor: string | undefined;

    do {
      const params = cursor === undefined ? {} : { cursor };

      const page = await client.listTools(params, { signal });

      forms.push(...page.tools.flatMap((tool) => parseToolForm(tool) ?? []));

      cursor = page.nextCursor;
    } while (cursor !== undefined);

    return { kind: 'listed', forms };
  } catch (error) {
    return { kind: 'failed', message: error instanceof Error ? error.message : 'unknown error' };
  } finally {
    await client.close().catch(() => null);
  }
}
