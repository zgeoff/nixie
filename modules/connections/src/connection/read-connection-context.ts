import { readClientByID } from '../client/read-client-by-id';
import { buildProviderSpec } from '../provider/build-provider-spec';
import type { ServiceContext } from '../service-context';
import { probeConnectionBroken } from '../status/probe-connection-broken';
import { writeCallFailed } from '../status/write-call-failed';
import type { ConnectionContext, ConnectionRow } from '../types';
import { openConnectionValues } from './open-connection-values';
import { readConnectionRowByID } from './read-connection-rows';

// What a tool, an attempt or a check of one live connection gets. Null when the connection is not
// live: unknown, forgotten, or a consent that has not finished.
export async function readConnectionContext(
  context: ServiceContext,
  connectionID: string,
): Promise<ConnectionContext | null> {
  const row = await readConnectionRowByID(context.log, connectionID);

  if (row?.binding !== 'enabled' || row.token_fingerprint === null) {
    return null;
  }

  return readRowContext(context, row);
}

interface RowContextOptions {
  // a call that fails while the connection is in a break leaves a record, so the return counts it;
  // a tool's context sets it, and a poll's or a check's does not
  readonly isCaller?: boolean;
}

// The context of a row, which a consent builds before it has a fingerprint.
export async function readRowContext(
  context: ServiceContext,
  row: ConnectionRow,
  options: RowContextOptions = {},
): Promise<ConnectionContext | null> {
  const client = await readClientByID(context, row.oauth_client_id);

  if (client === null) {
    return null;
  }

  const opened = await openConnectionValues(context.log, [row]);

  const values = opened.get(row.connection_id);

  // A tool call holds one context, and notes one failure however many requests it sends.
  let hasNoted = false;

  // A call registers the binding itself, so a context a tool holds across a consent that renewed the
  // connection reads the counter of its own time.
  const readResponse: ConnectionContext['fetch'] = async (input, init) => {
    const binding = await context.store.register(
      { backend: 'database', credentialID: row.connection_id },
      buildProviderSpec(context.endpoints, {
        kind: 'oauth_token',
        clientID: client.provider_client_id,
      }),
    );

    const send = context.store.fetcher(binding, context.endpoints.apiOrigins);

    if (options.isCaller !== true) {
      return send(input, init);
    }

    // The store moves a connection back to `active` when a request answers, so the break is read
    // before the request leaves.
    const callAtMs = context.now();

    const wasBroken = await probeConnectionBroken(context, row.connection_id);

    const noteOnce = async (): Promise<void> => {
      if (wasBroken && !hasNoted) {
        hasNoted = true;

        await writeCallFailed(context, row.connection_id, callAtMs);
      }
    };

    const response = await send(input, init).catch(async (error: unknown) => {
      await noteOnce();

      throw error;
    });

    if (!response.ok) {
      await noteOnce();
    }

    return response;
  };

  return {
    connectionID: row.connection_id,
    connection: row.short_id,
    account: values?.account?.email ?? '',
    fetch: readResponse,
  };
}
