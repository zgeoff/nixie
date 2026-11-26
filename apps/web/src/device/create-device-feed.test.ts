import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { buildBrowserClient } from '../client/build-browser-client';
import { deviceStore } from '../mocks/device-store';
import { mockLive } from '../mocks/mock-live';
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

  expect(mockLive.openedThreads).toHaveLength(1);
});

test('it closes the stream once no page retains it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const release = ctx.feed.retain();

  await waitFor(() => {
    expect(mockLive.openCount).toBe(1);
  });

  release();

  await waitFor(() => {
    expect(mockLive.openCount).toBe(0);
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

test('it sends no size for a view that sets the size the stream opened with', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.feed.setViewPixels({ width: 1000, height: 600, pixelRatio: 2 });
  ctx.retainUntilTestEnds();

  await waitFor(() => {
    expect(ctx.feed.getSnapshot().connection).toBe('open');
  });

  ctx.timer.advance(1000);

  expect(ctx.readResizes()).toStrictEqual([]);
});
