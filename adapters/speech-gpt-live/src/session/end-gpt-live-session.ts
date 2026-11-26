import type { GPTLiveSession } from '../types';

// Ends the session's stream and every timer of the session, and drops the sideband.
export function endGPTLiveSession(session: GPTLiveSession): void {
  if (session.isClosed) {
    return;
  }

  session.isClosed = true;

  session.stopping.abort();

  for (const waiter of session.waiters.splice(0)) {
    waiter(null);
  }

  session.socket.close();
}
