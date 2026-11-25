import type { CallsContext } from '../types';

// Marks the call to end once the running turn's answer is sent, so the user hears its last line.
export function markHangUp(context: CallsContext, callID: string): void {
  context.runtime.hangUps.add(callID);
}
