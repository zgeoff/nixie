import type { ConnectorContext, JSONObject } from '@heynixie/connections';
import type { GmailAccess } from './types';

// The live connection that a call's input names, which the endpoint put there before the call. Null
// when the connection was forgotten since.
export async function readCallContext(
  access: Pick<GmailAccess, 'readLiveContexts'>,
  input: JSONObject,
): Promise<ConnectorContext | null> {
  const connection = input['connection'];

  if (typeof connection !== 'string') {
    return null;
  }

  const [context] = await access.readLiveContexts(connection);

  return context ?? null;
}
