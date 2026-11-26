import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import type { DeviceFeed } from './create-device-feed';
import type { DeviceLocks } from './hold-device-stream-as-leader';
import { holdDeviceStreamAsLeader } from './hold-device-stream-as-leader';
import { initialDeviceEvents } from './initial-device-events';

interface Waiting {
  readonly onGranted: () => Promise<void>;
  readonly settle: () => void;
}

function setupTest() {
  const waiting: Waiting[] = [];
  const state = { isHeld: false };

  // one lock, granted to each request in turn, as a browser grants it across its tabs
  const grantNext = async (): Promise<void> => {
    const next = state.isHeld ? undefined : waiting.shift();

    if (next === undefined) {
      return;
    }

    state.isHeld = true;

    await next.onGranted();

    state.isHeld = false;

    next.settle();

    await grantNext();
  };

  const locks: DeviceLocks = {
    request: (_name, options, onGranted) =>
      new Promise<void>((resolve, reject) => {
        const entry: Waiting = { onGranted, settle: resolve };

        options.signal.addEventListener('abort', () => {
          const index = waiting.indexOf(entry);

          if (index !== -1) {
            waiting.splice(index, 1);

            reject(new DOMException('aborted', 'AbortError'));
          }
        });

        waiting.push(entry);
        void grantNext();
      }),
  };

  return {
    locks,
    buildCountingFeed: () => {
      const counts = { retained: 0 };

      const feed: DeviceFeed = {
        retain: () => {
          counts.retained += 1;

          return () => {
            counts.retained -= 1;
          };
        },
        subscribe: () => () => {},
        getSnapshot: () => initialDeviceEvents,
        setViewPixels: () => {},
      };

      return { feed, counts };
    },
  };
}

test('it holds the stream in one tab of the browser only', async () => {
  const ctx = setupTest();
  const first = ctx.buildCountingFeed();
  const second = ctx.buildCountingFeed();

  holdDeviceStreamAsLeader(first.feed, ctx.locks);
  holdDeviceStreamAsLeader(second.feed, ctx.locks);

  await waitFor(() => {
    expect(first.counts.retained).toBe(1);
  });

  expect(second.counts.retained).toBe(0);
});

test('it hands the stream to the next waiting tab when the holding tab closes', async () => {
  const ctx = setupTest();
  const first = ctx.buildCountingFeed();
  const second = ctx.buildCountingFeed();
  const stopFirst = holdDeviceStreamAsLeader(first.feed, ctx.locks);

  holdDeviceStreamAsLeader(second.feed, ctx.locks);

  await waitFor(() => {
    expect(first.counts.retained).toBe(1);
  });

  stopFirst();

  await waitFor(() => {
    expect([first.counts.retained, second.counts.retained]).toStrictEqual([0, 1]);
  });
});

test('it never holds the stream for a tab that closes while it waits', async () => {
  const ctx = setupTest();
  const first = ctx.buildCountingFeed();
  const second = ctx.buildCountingFeed();
  const stopFirst = holdDeviceStreamAsLeader(first.feed, ctx.locks);
  const stopSecond = holdDeviceStreamAsLeader(second.feed, ctx.locks);

  await waitFor(() => {
    expect(first.counts.retained).toBe(1);
  });

  stopSecond();
  stopFirst();

  await waitFor(() => {
    expect(first.counts.retained).toBe(0);
  });

  expect(second.counts.retained).toBe(0);
});

test('it holds the stream in a page that has no lock manager', () => {
  const ctx = setupTest();
  const only = ctx.buildCountingFeed();
  const stop = holdDeviceStreamAsLeader(only.feed, null);

  expect(only.counts.retained).toBe(1);

  stop();

  expect(only.counts.retained).toBe(0);
});
