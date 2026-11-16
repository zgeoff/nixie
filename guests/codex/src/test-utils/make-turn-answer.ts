import type { FakeNotification, FakeReply, FakeRequest } from './start-fake-app-server';

// The answers of a server that starts the thread `thread-1` and the turn `turn-1`, and then sends
// the notifications it is given after the turn starts.
export function makeTurnAnswer(
  afterTurnStart: readonly FakeNotification[] = [],
): (request: FakeRequest) => FakeReply {
  return (request) => {
    if (request.method === 'thread/start') {
      return { result: { thread: { id: 'thread-1' } } };
    }

    if (request.method === 'turn/start') {
      return { result: { turn: { id: 'turn-1' } }, after: afterTurnStart };
    }

    return {};
  };
}
