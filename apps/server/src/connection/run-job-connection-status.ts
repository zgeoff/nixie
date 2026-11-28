import type { Connections } from '@heynixie/connections';
import { renderConnectionStatus } from './render-connection-status';

// The status text of the connections a job run is pinned to, read as the run opens. A run that opens
// while a pinned connection is broken leaves a note, so the return counts it. The text leaves out the
// model credential, and reads as an empty text while each pinned connection works.
export async function runJobConnectionStatus(
  connections: Pick<Connections, 'readAttention' | 'writeRunsWithout'>,
  pinned: ReadonlySet<string>,
  timeZone: string,
): Promise<string> {
  await connections.writeRunsWithout(pinned);

  const attention = await connections.readAttention(pinned);

  return renderConnectionStatus({ connections: attention, modelCredential: null, timeZone });
}
