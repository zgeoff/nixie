import type { GPTLiveSession } from '../types';

// Sends one client event on the sideband. The caller names the event, so a later error or
// acknowledgement of it names the same ID.
export function sendGPTLiveEvent(session: GPTLiveSession, event: Record<string, unknown>): void {
  session.socket.send(JSON.stringify(event));
}
