import { readRunningCall } from '@heynixie/calls';
import type { ReadCallSession } from '@heynixie/devices';
import type { Log } from '@heynixie/log';

// The device tools learn which session carries the call from here, so the devices module never
// imports the calls module. A call that is still connecting carries no device yet.
export function makeReadCallSession(log: Log): ReadCallSession {
  return async () => {
    const call = await readRunningCall(log.writer.db);

    return call?.state === 'live' ? call.carryingSession : null;
  };
}
