import { expect, test } from 'bun:test';
import type { ExecStream } from '@heynixie/sandbox';
import { waitForCondition } from '@heynixie/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { makeGuestSession } from './make-guest-session';

function setupTest() {
  const logged: string[] = [];
  const messages = Promise.withResolvers<IteratorResult<Uint8Array<ArrayBuffer>>>();

  // an output that stays open, as a guest that still lives
  const stream: ExecStream = {
    messages: {
      [Symbol.asyncIterator]: () => ({ next: () => messages.promise }),
    },
    send: () => Promise.reject(new Error('the guest input is closed')),
    exit: new Promise(() => {}),
    stop: () => new Promise(() => {}),
  };

  const session = makeGuestSession({
    stream,
    scans: {
      scan: () => Promise.resolve({ kind: 'pass' as const }),
      scanText: () => Promise.resolve({ kind: 'pass' as const }),
    },
    clock: createFakeClock({ startMs: 0 }),
    logger: (event) => {
      logged.push(event);
    },
  });

  return { session, logged };
}

test('it closes a stream whose open the guest never received', async () => {
  const ctx = setupTest();
  const closes: string[] = [];

  ctx.session.openStream({
    onData: () => {},
    onClose: () => {
      closes.push('closed');
    },
  });

  await waitForCondition(() => closes.length === 1);

  expect([closes, ctx.logged]).toStrictEqual([['closed'], ['computer.vnc_send_failed']]);
});
