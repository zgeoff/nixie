import type { CallsContext } from '../types';
import { endCall } from '../utils/end-call';

// Ends the call as nixie's act when its turn asked to hang up. The turn's answer has gone to the
// speech layer by then, so the session closes after it.
export async function endAskedCall(context: CallsContext, callID: string): Promise<void> {
  if (context.runtime.hangUps.delete(callID)) {
    await endCall(context, callID, 'nixie');
  }
}
