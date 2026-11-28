import type { CredentialFetch } from '@heynixie/credentials';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { pickFailureCause } from '../health/pick-failure-cause';
import type { ListingFailureCause } from '../health/types';
import { parseToolForm } from '../pin/parse-tool-form';
import type { ToolForm } from '../types';
import { buildClient } from './build-client';
import { pickListingRefusal } from './pick-listing-refusal';

export interface ListRequest {
  readonly url: string;

  // sends each request with the server's access token added
  readonly send: CredentialFetch;

  // bounds the whole listing: the connection and every page of it together
  readonly timeoutMs: number;
}

export type ListOutcome =
  | { readonly kind: 'listed'; readonly forms: readonly ToolForm[] }
  | {
      readonly kind: 'failed';
      readonly message: string;
      readonly cause: ListingFailureCause;
    };

// One MCP `tools/list` of one server, over Streamable HTTP with no sampling, roots, logging or
// input-request capability. A listing that fails for any reason is a failure value, never a throw.
// A listing over the limits of a server, or one that holds two forms of a tool name, fails whole.
export async function listServerTools(request: ListRequest): Promise<ListOutcome> {
  const client = buildClient();

  const transport = new StreamableHTTPClientTransport(new URL(request.url), {
    fetch: request.send,
    redirectPolicy: 'same-origin',
  });

  const signal = AbortSignal.timeout(request.timeoutMs);

  try {
    await client.connect(transport, { signal });

    const forms: ToolForm[] = [];
    let pages = 0;
    let bytes = 0;
    let cursor: string | undefined;

    do {
      const params = cursor === undefined ? {} : { cursor };

      const page = await client.listTools(params, { signal });

      const pageForms = page.tools.flatMap((tool) => parseToolForm(tool) ?? []);
      const pageBytes = Buffer.byteLength(JSON.stringify(page.tools));

      const refusal = pickListingRefusal(
        { pages, toolCount: forms.length, bytes, names: new Set(forms.map((form) => form.name)) },
        { bytes: pageBytes, forms: pageForms },
      );

      if (refusal !== null) {
        return { kind: 'failed', message: refusal, cause: 'unparsable' };
      }

      pages += 1;
      bytes += pageBytes;

      forms.push(...pageForms);

      cursor = page.nextCursor;
    } while (cursor !== undefined);

    return { kind: 'listed', forms };
  } catch (error) {
    return {
      kind: 'failed',
      message: error instanceof Error ? error.message : 'unknown error',
      cause: pickFailureCause(error),
    };
  } finally {
    await client.close().catch(() => null);
  }
}
