import type { ConnectorContext, ProviderFetch } from '@heynixie/connections';
import type { JSONObject } from '@heynixie/log';
import type { GmailAccess } from './types';

// The live connection that a call's input names, which the endpoint put there before the call. Null
// when the connection was forgotten since. Each request of the context stops when `signal` aborts.
export async function readCallContext(
  access: Pick<GmailAccess, 'readLiveContexts'>,
  input: JSONObject,
  signal?: AbortSignal,
): Promise<ConnectorContext | null> {
  const connection = input['connection'];

  if (typeof connection !== 'string') {
    return null;
  }

  const [context] = await access.readLiveContexts(connection);

  if (context === undefined) {
    return null;
  }

  return signal === undefined
    ? context
    : { ...context, fetch: makeSignalFetch(context.fetch, signal) };
}

function makeSignalFetch(send: ProviderFetch, signal: AbortSignal): ProviderFetch {
  return (url, init) =>
    send(url, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
    });
}
