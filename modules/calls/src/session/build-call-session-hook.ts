import type { SessionHook } from '@heynixie/api';
import { hangUpCall } from '../hang-up/hang-up-call';
import type { CallsContext } from '../types';
import { readRunningCall } from '../utils/read-call';

// Ends the call that a session carries when the session signs out. A hang-up request that never
// arrived must not leave the call running after its session is gone, where it could block the next
// call until it times out.
export function buildCallSessionHook(calls: CallsContext): SessionHook {
  return {
    onSigningOut: async (_context, identityID) => {
      const running = await readRunningCall(calls.log.writer.db);

      if (running?.carryingSession === identityID) {
        await hangUpCall(calls, running.callID);
      }
    },
  };
}
