import type { CallState, CallsContext } from '../types';
import { endCall } from '../utils/end-call';
import { readCall } from '../utils/read-call';

export type HangUpResult =
  | { readonly status: 'done'; readonly state: CallState }
  | { readonly status: 'refused'; readonly error: 'CALL_NOT_FOUND' };

// Ends the call as the user's act. A call that is already over answers the same way, so a retry
// of the hang-up is safe.
export async function hangUpCall(context: CallsContext, callID: string): Promise<HangUpResult> {
  const call = await readCall(context.log.writer.db, callID);

  if (call === null) {
    return { status: 'refused', error: 'CALL_NOT_FOUND' };
  }

  if (call.state !== 'ended') {
    await endCall(context, callID, 'you');
  }

  return { status: 'done', state: 'ended' };
}
