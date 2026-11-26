import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { buildBrowserClient } from '../client/build-browser-client';
import { deviceStore } from '../mocks/device-store';
import { endMockDeviceStreams, mockLive } from '../mocks/mock-live';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { createDeviceFeed } from './create-device-feed';

function setupTest() {
  const timer = buildStubTimer();
  const feed = createDeviceFeed({ client: buildBrowserClient(), startTimer: timer.startTimer });

  return {
    feed,
    timer,
    retainUntilTestEnds: () => {
      const release = feed.retain();

      onTestFinished(release);
    },
    readResizes: () =>
      deviceStore.resizes.findMany().map((row) => ({
        width: row.width,
        height: row.height,
        pixelRatio: row.pixelRatio,
      })),
  };
}

test('it holds what the device stream sends while a page retains it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.retainUntilTestEnds();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().event).toStrictEqual({
      kind: 'idle',
      scene: [{ kind: 'markdown', text: '# Saturday' }],
    });
  });

  expect(ctx.feed.getSnapshot().connection).toBe('open');
});

test('it keeps one stream open when one page replaces another in the same step', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const releaseFirst = ctx.feed.retain();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().connection).toBe('open');
  });

  releaseFirst();

  const releaseSecond = ctx.feed.retain();

  onTestFinished(releaseSecond);

  await Promise.resolve();

  expect(mockLive.deviceOpenedCount).toBe(1);
});

test('it closes the stream once no page retains it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const release = ctx.feed.retain();

  await waitFor(() => {
    expect(mockLive.deviceOpenCount).toBe(1);
  });

  release();

  await waitFor(() => {
    expect(mockLive.deviceOpenCount).toBe(0);
  });

  expect(ctx.feed.getSnapshot().connection).toBe('connecting');
});

test('it sends the size of the view to the open stream, once it settles', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.retainUntilTestEnds();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().connection).toBe('open');
  });

  ctx.feed.setViewPixels({ width: 1000, height: 600, pixelRatio: 2 });
  ctx.feed.setViewPixels({ width: 1100, height: 650, pixelRatio: 2 });
  ctx.timer.advance(250);

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(1);
  });

  expect(ctx.readResizes()).toStrictEqual([{ width: 1100, height: 650, pixelRatio: 2 }]);
});

test('it sends the size of the view once a stream opens with it, because another tab may have set a size', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.feed.setViewPixels({ width: 1000, height: 600, pixelRatio: 2 });
  ctx.retainUntilTestEnds();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().connection).toBe('open');
  });

  ctx.timer.advance(250);

  await waitFor(() => {
    expect(ctx.readResizes()).toStrictEqual([{ width: 1000, height: 600, pixelRatio: 2 }]);
  });
});

test('it sends the size of the view again after a reconnect', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.feed.setViewPixels({ width: 1000, height: 600, pixelRatio: 2 });
  ctx.retainUntilTestEnds();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().connection).toBe('open');
  });

  ctx.timer.advance(250);

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(1);
  });

  endMockDeviceStreams();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().connection).toBe('lost');
  });

  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().connection).toBe('open');
  });

  ctx.timer.advance(250);

  await waitFor(() => {
    expect(ctx.readResizes()).toHaveLength(2);
  });
});

test('it drops what the device showed once the session is refused', async () => {
  const ctx = setupTest();

  const session = await createDeviceSession();

  ctx.retainUntilTestEnds();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().event).not.toBeNull();
  });

  await store.sessions.update(session, {
    data(draft) {
      draft.revokedAt = new Date();
    },
  });

  endMockDeviceStreams();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().connection).toBe('lost');
  });

  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().connection).toBe('refused');
  });

  expect(ctx.feed.getSnapshot()).toStrictEqual({
    event: null,
    layout: null,
    messages: [],
    notices: [],
    lastMessageID: 0,
    lastNoticeID: 0,
    connection: 'refused',
  });
});
