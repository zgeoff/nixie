import { expect, test } from 'bun:test';
import type { ExecStream } from '@heynixie/sandbox';
import { waitForCondition } from '@heynixie/testing';
import type { GuestSession } from '../make-guest-session';
import { openComputerWatch } from './open-computer-watch';

function setupTest(options: { isGuestSlow?: boolean; isGuestOpen?: boolean } = {}) {
  const version = [...new TextEncoder().encode('RFB 003.008\n'), 1, 1];
  const state = { holds: 0, releases: 0, closed: false, isHolding: false, inputs: 0 };
  const streamed: string[] = [];
  const waking = Promise.withResolvers<GuestSession>();
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
    openStream: () =>
      options.isGuestOpen === true
        ? {
            send: (bytes) => {
              streamed.push([...bytes].join(','));

              return Promise.resolve();
            },
            flush: () => {
              streamed.push('flush');

              return Promise.resolve();
            },
            close: () => {},
          }
        : {
            send: guestStream.send,
            flush: () => Promise.reject(new Error('the guest input is closed')),
            close: () => {},
          },
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
    readGuest: () => (options.isGuestSlow === true ? waking.promise : Promise.resolve(guest)),
  };

  return {
    state,
    watches,
    logged,
    version,
    streamed,
    wakeGuest: () => {
      waking.resolve(guest);
    },
    open: () =>
      openComputerWatch(
        host,
        {
          send: () => {},
          close: () => {
            state.closed = true;
          },
        },
        {
          canInput: () => state.isHolding,
          onInput: () => {
            state.inputs += 1;
          },
        },
      ),
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

test('it passes the pointer of the viewer that holds the desktop to the guest and counts it as input', async () => {
  const ctx = setupTest({ isGuestOpen: true });
  const watch = ctx.open();

  ctx.state.isHolding = true;

  watch.receive(new Uint8Array([...ctx.version, 5, 1, 0, 10, 0, 20]));

  await waitForCondition(() => ctx.streamed.length === 4);

  expect([ctx.streamed.at(-1), ctx.state.inputs]).toStrictEqual(['5,1,0,10,0,20', 1]);
});

test('it keeps the pointer of a viewer that does not hold the desktop from the guest', async () => {
  const ctx = setupTest({ isGuestOpen: true });
  const watch = ctx.open();

  watch.receive(new Uint8Array([...ctx.version, 5, 1, 0, 10, 0, 20]));

  await waitForCondition(() => ctx.streamed.length === 3);

  expect([ctx.streamed.at(-1), ctx.state.inputs]).toStrictEqual(['1', 0]);
});

test('it flushes the guest, then releases what is pressed and asks for a whole screen', async () => {
  const ctx = setupTest({ isGuestOpen: true });
  const watch = ctx.open();

  ctx.state.isHolding = true;

  watch.receive(new Uint8Array([...ctx.version, 5, 1, 0, 10, 0, 20]));

  await waitForCondition(() => ctx.streamed.length === 4);

  watch.releaseInput();

  await waitForCondition(() => ctx.streamed.length === 7);

  expect(ctx.streamed.slice(4)).toStrictEqual(['flush', '5,0,0,10,0,20', '3,0,0,0,0,0,5,0,3,32']);
});

test('it drops the viewer input that waits for a guest that is still waking', async () => {
  const ctx = setupTest({ isGuestSlow: true, isGuestOpen: true });
  const watch = ctx.open();

  ctx.state.isHolding = true;

  watch.receive(new Uint8Array([...ctx.version, 5, 1, 0, 10, 0, 20]));
  watch.releaseInput();
  ctx.wakeGuest();

  await waitForCondition(() => ctx.streamed.length === 3);

  expect(ctx.streamed).toStrictEqual([
    [...new TextEncoder().encode('RFB 003.008\n')].join(','),
    '1',
    '1',
  ]);
});
