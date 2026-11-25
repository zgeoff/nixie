import type { SpeechEvent } from '@heynixie/calls';
import type { GPTLiveSession } from '../types';

// Gives the event to the reader of the session's stream, or keeps it for the next read.
export function raiseSpeechEvent(session: GPTLiveSession, event: SpeechEvent): void {
  if (session.isClosed) {
    return;
  }

  const waiter = session.waiters.shift();

  if (waiter === undefined) {
    session.queue.push(event);
  } else {
    waiter(event);
  }
}
