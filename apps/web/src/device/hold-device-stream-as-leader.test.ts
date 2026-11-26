import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { buildBrowserClient } from '../client/build-browser-client';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import type { DeviceFeed } from './create-device-feed';
import { createDeviceFeed } from './create-device-feed';
import type { DeviceChannel, DeviceLocks } from './hold-device-stream-as-leader';
import { holdDeviceStreamAsLeader } from './hold-device-stream-as-leader';
import { initialDeviceEvents } from './initial-device-events';
import type { DeviceEvents } from './types';

interface Waiting {
  readonly onGranted: () => Promise<void>;
  readonly settle: () => void;
}

function setupTest() {
  const waiting: Waiting[] = [];
  const lockState = { isHeld: false };
  const timer = buildStubTimer();

  // one bus per test, so no tab of another test hears this test's tabs
  const busName = `device-stream-${crypto.randomUUID()}`;
  const cuts: { isCut: boolean }[] = [];

  // one lock, granted to each request in turn, as a browser grants it across its tabs
  const grantNext = async (): Promise<void> => {
    const next = lockState.isHeld ? undefined : waiting.shift();

    if (next === undefined) {
      return;
    }

    lockState.isHeld = true;

    await next.onGranted();

    lockState.isHeld = false;

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

  // a cut channel neither sends nor hears, as the channel of a tab that crashed
  const openChannel = (): DeviceChannel => {
    const channel = new BroadcastChannel(busName);

    const cut = { isCut: false };

    cuts.push(cut);

    return {
      send: (message) => {
        if (!cut.isCut) {
          // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel reaches only its own origin and takes no target origin
          channel.postMessage(message);
        }
      },
      listen: (onMessage) => {
        channel.addEventListener('message', (event) => {
          if (!cut.isCut) {
            onMessage(event.data);
          }
        });
      },
      close: () => {
        channel.close();
      },
    };
  };

  return {
    timer,
    buildTab: (tab: string, lockManager: DeviceLocks | null) => {
      const state = { retained: 0, events: initialDeviceEvents, mirrored: initialDeviceEvents };

      const listeners = new Set<() => void>();

      const feed: DeviceFeed = {
        retain: () => {
          state.retained += 1;

          return () => {
            state.retained -= 1;
          };
        },
        subscribe: (onChange) => {
          listeners.add(onChange);

          return () => {
            listeners.delete(onChange);
          };
        },
        getSnapshot: () => state.events,
        setViewPixels: () => {},
        mirror: (events) => {
          state.mirrored = events;
        },
      };

      const stop = holdDeviceStreamAsLeader(feed, {
        tab,
        locks: lockManager,
        openChannel,
        startTimer: timer.startTimer,
      });

      onTestFinished(stop);

      const cut = cuts.at(-1);

      return {
        stop,
        state,
        crash: () => {
          if (cut !== undefined) {
            cut.isCut = true;
          }
        },
        showOnStream: (events: DeviceEvents) => {
          state.events = events;

          for (const listener of listeners) {
            listener();
          }
        },
      };
    },

    // a tab whose feed opens a real device stream against the mock API
    createStreamingTab: (tab: string) => {
      const feed = createDeviceFeed({ client: buildBrowserClient(), startTimer: timer.startTimer });

      const stop = holdDeviceStreamAsLeader(feed, {
        tab,
        locks: null,
        openChannel,
        startTimer: timer.startTimer,
      });

      onTestFinished(stop);

      return { feed };
    },
    buildTabWithoutChannel: () => {
      const state = { retained: 0 };

      const feed: DeviceFeed = {
        retain: () => {
          state.retained += 1;

          return () => {
            state.retained -= 1;
          };
        },
        subscribe: () => () => {},
        getSnapshot: () => initialDeviceEvents,
        setViewPixels: () => {},
        mirror: () => {},
      };

      const stop = holdDeviceStreamAsLeader(feed, {
        tab: 'only',
        locks,
        openChannel: null,
        startTimer: timer.startTimer,
      });

      return { stop, state };
    },
    locks,
  };
}

test('it holds the stream in one tab of the browser only', async () => {
  const ctx = setupTest();
  const first = ctx.buildTab('a', ctx.locks);
  const second = ctx.buildTab('b', ctx.locks);

  await waitFor(() => {
    expect(first.state.retained).toBe(1);
  });

  expect(second.state.retained).toBe(0);
});

test('it hands the stream to the next waiting tab when the holding tab closes', async () => {
  const ctx = setupTest();
  const first = ctx.buildTab('a', ctx.locks);
  const second = ctx.buildTab('b', ctx.locks);

  await waitFor(() => {
    expect(first.state.retained).toBe(1);
  });

  first.stop();

  await waitFor(() => {
    expect([first.state.retained, second.state.retained]).toStrictEqual([0, 1]);
  });
});

test('it never holds the stream for a tab that closes while it waits', async () => {
  const ctx = setupTest();
  const first = ctx.buildTab('a', ctx.locks);
  const second = ctx.buildTab('b', ctx.locks);

  await waitFor(() => {
    expect(first.state.retained).toBe(1);
  });

  second.stop();
  first.stop();

  await waitFor(() => {
    expect(first.state.retained).toBe(0);
  });

  expect(second.state.retained).toBe(0);
});

test('it sends what the holding tab shows to each other tab, a tab that joins later included', async () => {
  const ctx = setupTest();
  const first = ctx.buildTab('a', ctx.locks);

  await waitFor(() => {
    expect(first.state.retained).toBe(1);
  });

  first.showOnStream({
    ...initialDeviceEvents,
    event: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Sunday' }] },
    connection: 'open',
  });

  const second = ctx.buildTab('b', ctx.locks);

  await waitFor(() => {
    expect(second.state.mirrored).toStrictEqual({
      ...initialDeviceEvents,
      event: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Sunday' }] },
      connection: 'open',
    });
  });
});

test('it holds the stream in one of three tabs of a browser with no lock manager', async () => {
  const ctx = setupTest();
  const tabs = [ctx.buildTab('a', null), ctx.buildTab('b', null), ctx.buildTab('c', null)];

  ctx.timer.advance(200);

  await waitFor(() => {
    expect(tabs.map((tab) => tab.state.retained)).toStrictEqual([1, 0, 0]);
  });
});

test('it lets a tab that joins later follow the holder of a browser with no lock manager', async () => {
  const ctx = setupTest();
  const first = ctx.buildTab('b', null);

  ctx.timer.advance(200);

  await waitFor(() => {
    expect(first.state.retained).toBe(1);
  });

  const second = ctx.buildTab('a', null);

  await waitFor(() => {
    expect(second.state.mirrored).toStrictEqual(initialDeviceEvents);
  });

  ctx.timer.advance(200);

  expect([first.state.retained, second.state.retained]).toStrictEqual([1, 0]);
});

test('it hands the stream on when the holding tab of a browser with no lock manager closes', async () => {
  const ctx = setupTest();
  const first = ctx.buildTab('a', null);
  const second = ctx.buildTab('b', null);

  ctx.timer.advance(200);

  await waitFor(() => {
    expect([first.state.retained, second.state.retained]).toStrictEqual([1, 0]);
  });

  first.stop();

  // each try moves the clock by one claim delay, and the tries end well before the next probe, so
  // only the holder's resignation hands the stream on in time
  await waitFor(() => {
    ctx.timer.advance(200);

    expect([first.state.retained, second.state.retained]).toStrictEqual([0, 1]);
  });
});

test('it takes the stream when the holder of a browser with no lock manager stops answering', async () => {
  const ctx = setupTest();
  const first = ctx.buildTab('a', null);
  const second = ctx.buildTab('b', null);

  ctx.timer.advance(200);

  await waitFor(() => {
    expect([first.state.retained, second.state.retained]).toStrictEqual([1, 0]);
  });

  first.crash();
  ctx.timer.advance(5000);
  ctx.timer.advance(200);

  await waitFor(() => {
    expect(second.state.retained).toBe(1);
  });
});

test('it shows what the keeper shows in a tab that gave up the stream it took at the same time', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const keeper = ctx.buildTab('a', null);
  const yielder = ctx.createStreamingTab('b');

  keeper.showOnStream({
    ...initialDeviceEvents,
    event: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Sunday' }] },
    connection: 'open',
  });

  ctx.timer.advance(200);

  await waitFor(() => {
    expect(yielder.feed.getSnapshot()).toStrictEqual({
      ...initialDeviceEvents,
      event: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Sunday' }] },
      connection: 'open',
    });
  });
});

test('it holds its own stream in a browser with no channel between its tabs', () => {
  const ctx = setupTest();
  const only = ctx.buildTabWithoutChannel();

  expect(only.state.retained).toBe(1);

  only.stop();

  expect(only.state.retained).toBe(0);
});
