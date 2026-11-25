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
  const shown: number[][] = [];
  const desktop: { send: ((bytes: Uint8Array) => void) | null } = { send: null };

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
    openStream: (listener) => {
      desktop.send = listener.onData;

      return options.isGuestOpen === true
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
          };
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
    shown,

    // the desktop's handshake, with a ServerInit of 32 bits per pixel, and 6 bytes of copied text
    desktopHello: [
      ...new TextEncoder().encode('RFB 003.008\n'),
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      32,
      24,
      0,
      1,
      0,
      255,
      0,
      255,
      0,
      255,
      16,
      8,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ],
    copiedText: [3, 0, 0, 0, 0, 0, 0, 6, 115, 101, 99, 114, 101, 116],
    isStreamOpen: () => desktop.send !== null,
    sendFromDesktop: (bytes: number[]) => {
      desktop.send?.(new Uint8Array(bytes));
    },
    wakeGuest: () => {
      waking.resolve(guest);
    },
    open: () =>
      openComputerWatch(
        host,
        {
          send: (bytes) => {
            shown.push([...bytes]);
          },
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

test('it closes the socket after the release has gone out, when the hold ended on its own', async () => {
  const ctx = setupTest({ isGuestOpen: true });
  const watch = ctx.open();

  ctx.state.isHolding = true;

  watch.receive(new Uint8Array([...ctx.version, 5, 1, 0, 10, 0, 20]));

  await waitForCondition(() => ctx.streamed.length === 4);

  watch.releaseInput();
  watch.closeAfterRelease();

  await waitForCondition(() => ctx.state.closed);

  expect(ctx.streamed.slice(4)).toStrictEqual(['flush', '5,0,0,10,0,20', '3,0,0,0,0,0,5,0,3,32']);
});

test('it keeps the text that the desktop copied from a viewer that only watches', async () => {
  const ctx = setupTest({ isGuestOpen: true });

  ctx.open();

  await waitForCondition(ctx.isStreamOpen);

  ctx.sendFromDesktop(ctx.desktopHello);
  ctx.sendFromDesktop([...ctx.copiedText, 2]);

  expect(ctx.shown.flat()).toStrictEqual([...ctx.desktopHello, 2]);
});

test('it shows the text that the desktop copied to the viewer that holds the desktop', async () => {
  const ctx = setupTest({ isGuestOpen: true });

  ctx.state.isHolding = true;

  ctx.open();

  await waitForCondition(ctx.isStreamOpen);

  ctx.sendFromDesktop(ctx.desktopHello);
  ctx.sendFromDesktop([...ctx.copiedText, 2]);

  expect(ctx.shown.flat()).toStrictEqual([...ctx.desktopHello, ...ctx.copiedText, 2]);
});

test('it ends the watch when the desktop sends bytes that cannot be told from copied text', async () => {
  const ctx = setupTest({ isGuestOpen: true });

  ctx.open();

  await waitForCondition(ctx.isStreamOpen);

  ctx.sendFromDesktop([...ctx.desktopHello, 9]);

  expect([ctx.state.closed, ctx.logged]).toStrictEqual([true, ['computer.watch_malformed']]);
});
