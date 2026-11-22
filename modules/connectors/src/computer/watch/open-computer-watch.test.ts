import { expect, test } from 'bun:test';
import type { ExecStream } from '@heynixie/sandbox';
import { waitForCondition } from '@heynixie/testing';
import type { GuestSession } from '../make-guest-session';
import { openComputerWatch } from './open-computer-watch';

function setupTest(options: { isGuestSlow?: boolean } = {}) {
  const state = { holds: 0, releases: 0, closed: false };
  const watches = { count: 0 };
  const logged: string[] = [];

  // a guest whose input is gone: it takes an open and rejects every write
  const guestStream: ExecStream = {
    messages: {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
    },
    send: () => Promise.reject(new Error('the guest input is closed')),
    exit: new Promise(() => {}),
    stop: () => new Promise(() => {}),
  };

  const guest: GuestSession = {
    openStream: () => ({ send: guestStream.send, close: () => {} }),
    exchange: () => Promise.reject(new Error('no call runs in this test')),
    stream: guestStream,
  };

  const host = {
    watches,
    logger: (event: string) => {
      logged.push(event);
    },
    hold: () => {
      state.holds += 1;

      return () => {
        state.releases += 1;
      };
    },
    readGuest: () =>
      options.isGuestSlow ? new Promise<GuestSession>(() => {}) : Promise.resolve(guest),
  };

  return {
    state,
    watches,
    logged,
    open: () =>
      openComputerWatch(host, {
        send: () => {},
        close: () => {
          state.closed = true;
        },
      }),
  };
}

test('it ends the watch and releases the hold when a write to the guest fails', async () => {
  const ctx = setupTest();
  const watch = ctx.open();

  watch.receive(new TextEncoder().encode('RFB 003.008\n'));

  await waitForCondition(() => ctx.state.closed);

  expect([ctx.state.releases, ctx.watches.count, ctx.logged]).toStrictEqual([
    1,
    0,
    ['computer.watch_send_failed'],
  ]);
});

test('it closes the watch as flooded before it parses a batch that crosses the limit while the guest wakes', async () => {
  const ctx = setupTest({ isGuestSlow: true });
  const watch = ctx.open();
  const encodings = [2, 0, 0, 255, ...Array.from({ length: 255 * 4 }, () => 0)];

  watch.receive(
    new Uint8Array([
      ...new TextEncoder().encode('RFB 003.008\n'),
      1,
      1,
      ...Array.from({ length: 70 }, () => encodings).flat(),
      99,
    ]),
  );

  await waitForCondition(() => ctx.state.closed);

  expect([ctx.state.releases, ctx.watches.count, ctx.logged]).toStrictEqual([
    1,
    0,
    ['computer.watch_flooded'],
  ]);
});
