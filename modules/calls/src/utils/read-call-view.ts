import type { CallState, CallsContext, ReconnectCause } from '../types';
import type { CallEndedBy } from './call-ended-by';
import { readCall } from './read-call';

export interface CallView {
  readonly callID: string;
  readonly state: CallState;
  readonly endedBy: CallEndedBy | null;

  // set while a live call needs a new offer from the carrying device
  readonly reconnect: ReconnectCause | null;
}

// What the carrying device reads of a call, or null for a call that does not exist. A live call
// with no speech session in this process, as after a restart, waits for an offer as `restart`.
export async function readCallView(
  context: CallsContext,
  callID: string,
): Promise<CallView | null> {
  const call = await readCall(context.log.writer.db, callID);

  if (call === null) {
    return null;
  }

  const reconnect = call.state === 'live' ? pickReconnect(context, callID) : null;

  return { callID, state: call.state, endedBy: call.endedBy, reconnect };
}

function pickReconnect(context: CallsContext, callID: string): ReconnectCause | null {
  const wait = context.runtime.reconnects.get(callID);

  if (wait !== undefined) {
    return wait.cause;
  }

  return context.sessions.has(callID) ? null : 'restart';
}
