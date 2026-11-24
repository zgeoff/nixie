import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { buildBrowserClient } from '../client/build-browser-client';
import type { LiveRecord } from '../conversation/use-live-records';
import { mockLive, publishMockChanged } from '../mocks/mock-live';
import { server } from '../mocks/server';
import { store } from '../mocks/store';
import { buildStubTimer } from '../test-utils/build-stub-timer';
import { createDeviceSession } from '../test-utils/create-device-session';
import { createLiveFeed, liveFallbackMs } from './create-live-feed';

function setupTest() {
  const timer = buildStubTimer();
  const invalidate = mock<(topics: readonly string[]) => void>();

  const feed = createLiveFeed({
    client: buildBrowserClient(),
    startTimer: timer.startTimer,
    invalidate,
  });

  return {
    feed,
    invalidate,
    timer,
    holdOpen: () => {
      const release = feed.retain();

      onTestFinished(async () => {
        release();

        await waitFor(() => {
          expect(mockLive.openCount).toBe(0);
        });
      });

      return release;
    },
    follow: (view: Parameters<typeof feed.follow>[0]) => {
      const unfollow = feed.follow(view);

      onTestFinished(async () => {
        unfollow();

        await waitFor(() => {
          expect(mockLive.openCount).toBe(0);
        });
      });

      return unfollow;
    },
  };
}

test('it opens one stream with no thread while a page retains it, and none after the release', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const release = ctx.holdOpen();

  await waitFor(() => {
    expect(mockLive.openCount).toBe(1);
  });

  release();

  await waitFor(() => {
    expect(mockLive.openCount).toBe(0);
  });

  expect(mockLive.openedThreads).toStrictEqual([undefined]);
});

test('it reads every topic again when its first stream opens', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.holdOpen();

  await waitFor(() => {
    expect(ctx.invalidate).toHaveBeenCalledOnce();
  });

  expect(ctx.invalidate).toHaveBeenCalledWith([
    'approvals',
    'backups',
    'computer',
    'definitions',
    'images',
    'memory',
    'nixie',
    'notebook',
    'spend',
    'tasks',
    'triggers',
  ]);
});

test('it reads the topics a changed event names', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.holdOpen();

  await waitFor(() => {
    expect(ctx.invalidate).toHaveBeenCalledOnce();
  });

  publishMockChanged(['nixie', 'tasks']);

  await waitFor(() => {
    expect(ctx.invalidate).toHaveBeenLastCalledWith(['nixie', 'tasks']);
  });
});

test('it sends a view the records of its thread after the sequence it read at', async () => {
  const ctx = setupTest();
  const onRecord = mock<(record: LiveRecord) => void>();

  await createDeviceSession();

  const read = await store.records.create({ kind: 'owner_message', thread: 'conversation' });

  ctx.follow({ thread: 'conversation', afterSequence: read.sequence, onRecord });

  const next = await store.records.create({ kind: 'model.reply', thread: 'conversation' });

  await waitFor(() => {
    expect(onRecord).toHaveBeenCalledOnce();
  });

  expect(onRecord.mock.calls[0]?.[0].sequence).toBe(next.sequence);
});

test('it opens the stream of a new view beside the old one, closes the old one once the new one opens, and reads no topic again', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.holdOpen();

  await waitFor(() => {
    expect(ctx.invalidate).toHaveBeenCalledOnce();
  });

  ctx.follow({ thread: 'conversation', afterSequence: 0, onRecord: () => {} });

  await waitFor(() => {
    expect(mockLive.openedThreads).toStrictEqual([undefined, 'conversation']);
  });

  await waitFor(() => {
    expect(mockLive.openCount).toBe(1);
  });

  expect(ctx.invalidate).toHaveBeenCalledOnce();
});

test('it opens a stream with no thread again once the last view leaves', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.holdOpen();

  const unfollow = ctx.follow({ thread: 'conversation', afterSequence: 0, onRecord: () => {} });

  await waitFor(() => {
    expect(mockLive.openedThreads).toContain('conversation');
  });

  unfollow();

  await waitFor(() => {
    expect(mockLive.openedThreads.at(-1)).toBeUndefined();
  });

  await waitFor(() => {
    expect(mockLive.openCount).toBe(1);
  });
});

test('it opens one stream for two changes of the page in the same step', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const first = ctx.follow({ thread: 'one', afterSequence: 0, onRecord: () => {} });

  first();

  ctx.follow({ thread: 'two', afterSequence: 0, onRecord: () => {} });

  await waitFor(() => {
    expect(mockLive.openedThreads).toStrictEqual(['two']);
  });
});

test('it reads every topic again when the stream reconnects', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  ctx.holdOpen();

  await waitFor(() => {
    expect(ctx.invalidate).toHaveBeenCalledOnce();
  });

  globalThis.dispatchEvent(new Event('online'));

  await waitFor(() => {
    expect(ctx.invalidate).toHaveBeenCalledTimes(2);
  });
});

test('it reports live updates unavailable after 3 failed attempts, and reads every topic each 60 s meanwhile', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/live/follow', () => HttpResponse.error()));
  ctx.holdOpen();

  await ctx.timer.advanceToNext();
  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(ctx.feed.isAvailable()).toBeFalse();
  });

  ctx.timer.advance(liveFallbackMs);

  expect(ctx.invalidate).toHaveBeenCalledOnce();
});

test('it stops the 60 s reads once a stream opens again', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(
    http.post('*/rpc/live/follow', () => HttpResponse.error(), { once: true }),
    http.post('*/rpc/live/follow', () => HttpResponse.error(), { once: true }),
    http.post('*/rpc/live/follow', () => HttpResponse.error(), { once: true }),
  );

  ctx.holdOpen();

  await ctx.timer.advanceToNext();
  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(ctx.feed.isAvailable()).toBeFalse();
  });

  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(ctx.feed.isAvailable()).toBeTrue();
  });

  ctx.invalidate.mockClear();
  ctx.timer.advance(liveFallbackMs);

  expect(ctx.invalidate).not.toHaveBeenCalledWith(expect.arrayContaining(['tasks']));
});
