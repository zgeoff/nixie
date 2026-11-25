import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { isSupportedGateway } from './is-supported-gateway';

// What one call to an atc-gateway tool came to. A `failed` call is atc's own answer, with its error
// code; `refused` is a call that never ran; `unknown` is one that left and gave no answer.
export type ATCOutcome =
  | { readonly status: 'ok'; readonly data: unknown }
  | { readonly status: 'failed'; readonly code: string }
  | { readonly status: 'refused'; readonly canClear: boolean; readonly reason: string }
  | { readonly status: 'unknown'; readonly reason: string };

export type CallATC = (
  tool: string,
  args: Readonly<Record<string, unknown>>,
  signal?: AbortSignal,
) => Promise<ATCOutcome>;

export interface ATCConnection {
  // the gateway's MCP endpoint
  readonly url: string;

  // the bearer of each request
  readonly token: string;
}

interface HTTPTrace {
  status: number | null;
}

// Calls a tool on atc-gateway over a connection of its own, so the initialize that each call makes
// gives the gateway's version, and a failure belongs to the one call.
export function makeATCCaller(connection: ATCConnection): CallATC {
  return async (tool, args, signal) => {
    const trace: HTTPTrace = { status: null };

    const client = new Client(
      { name: 'nixie', version: '0.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    );

    const traceResponse = makeTracedFetch(trace);

    const transport = new StreamableHTTPClientTransport(new URL(connection.url), {
      fetch: traceResponse,
      requestInit: { headers: { authorization: `Bearer ${connection.token}` } },
    });

    try {
      await client.connect(transport);
    } catch {
      return (
        pickHTTPRefusal(trace.status) ?? {
          status: 'refused',
          canClear: true,
          reason: 'connection_failed',
        }
      );
    }

    try {
      if (!isSupportedGateway(client.getServerVersion()?.version)) {
        return { status: 'refused', canClear: true, reason: 'unsupported_gateway' };
      }

      return await runCall({ client, trace, signal }, tool, args);
    } finally {
      await client.close().catch(() => {});
    }
  };
}

type TracedFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function makeTracedFetch(trace: HTTPTrace): TracedFetch {
  return async (input, init) => {
    const response = await fetch(input, init);

    trace.status = response.status;

    return response;
  };
}

function pickHTTPRefusal(status: number | null): ATCOutcome | null {
  if (status === 401) {
    return { status: 'refused', canClear: true, reason: 'unauthorized' };
  }

  if (status === 403) {
    return { status: 'refused', canClear: false, reason: 'insufficient_scope' };
  }

  return null;
}

const failureSchema = z.object({ code: z.string() });

interface OpenCall {
  readonly client: Client;
  readonly trace: HTTPTrace;
  readonly signal: AbortSignal | undefined;
}

async function runCall(
  open: OpenCall,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<ATCOutcome> {
  const options = open.signal === undefined ? undefined : { signal: open.signal };

  try {
    const result = await open.client.callTool({ name: tool, arguments: { ...args } }, options);

    if (result.isError === true) {
      const failure = failureSchema.safeParse(result.structuredContent);

      return { status: 'failed', code: failure.success ? failure.data.code : 'tool_failed' };
    }

    return { status: 'ok', data: result.structuredContent ?? {} };
  } catch {
    return pickHTTPRefusal(open.trace.status) ?? { status: 'unknown', reason: 'connection_lost' };
  }
}
