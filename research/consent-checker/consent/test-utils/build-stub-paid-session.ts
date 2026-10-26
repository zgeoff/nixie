import type { PaidSession } from '../run-paid-query.ts';

export interface StubPaidSession {
  session: PaidSession;
  isClosed: () => boolean;
}

// Stands in for the Agent SDK's query session: it yields the messages it holds in order, then ends.
export function buildStubPaidSession(messages: readonly unknown[]): StubPaidSession {
  let isClosed = false;

  return {
    session: {
      async *[Symbol.asyncIterator]() {
        yield* messages;
      },
      close: () => {
        isClosed = true;
      },
    },
    isClosed: () => isClosed,
  };
}
