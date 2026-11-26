import type { CallState, CallsContext } from '../types';
import type { CallEndedBy } from '../utils/call-ended-by';
import { endCall } from '../utils/end-call';
import { readCall } from '../utils/read-call';

export type HangUpResult =
  | { readonly status: 'done'; readonly state: CallState; readonly endedBy: CallEndedBy }
  | { readonly status: 'refused'; readonly error: 'CALL_NOT_FOUND' };

// Ends the call as the user's act. A call that is already over answers the same way, so a retry
// of the hang-up is safe. The result says who ended the call, which is `you` only when this
// request did, because a call the server ended first keeps its own reason.
export async function hangUpCall(context: CallsContext, callID: string): Promise<HangUpResult> {
  const call = await readCall(context.log.writer.db, callID);

  if (call === null) {
    return { status: 'refused', error: 'CALL_NOT_FOUND' };
  }

  const endedBy = call.state === 'ended' ? call.endedBy : await endCall(context, callID, 'you');

  // an end that landed between the read and the write left its reason on the call
  const reread = endedBy === null ? await readCall(context.log.writer.db, callID) : null;

  return { status: 'done', state: 'ended', endedBy: endedBy ?? reread?.endedBy ?? 'you' };
}
