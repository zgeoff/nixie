import type { Connections } from '@heynixie/connections';
import { renderConnectionStatus } from './render-connection-status';

// The status text of the connections a job run is pinned to. It leaves out the model credential,
// because a job run can do nothing about it, and it reads as an empty text while each pinned
// connection works.
export async function readJobConnectionStatus(
  connections: Pick<Connections, 'readAttention'>,
  pinned: ReadonlySet<string>,
  timeZone: string,
): Promise<string> {
  const attention = await connections.readAttention(pinned);

  return renderConnectionStatus({ connections: attention, modelCredential: null, timeZone });
}
