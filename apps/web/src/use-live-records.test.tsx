import { expect, mock, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { buildStubTimer } from './test-utils/build-stub-timer';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useLiveRecords } from './use-live-records';

async function setupTest() {
  // the API streams the log only to a signed-in browser
  const session = await createDeviceSession();

  // records each follow request's input, and lets the mock API answer it
  const follows = mock<(body: unknown) => void>();

  server.use(
    http.post('*/rpc/records/follow', async (info) => {
      const body: unknown = await info.request.clone().json();

      follows(body);
    }),
  );

  return { follows, session, timer: buildStubTimer() };
}

test('it delivers a tool call and its result within a second of the API recording them', async () => {
  await setupTest();

  const hook = renderHook(() => useLiveRecords('conversation', 0));

  await store.records.create({ kind: 'tool_called' });
  await store.records.create({ kind: 'tool_result' });

  await waitFor(
    () => {
      expect(hook.result.current.records.map((record) => record.kind)).toStrictEqual([
        'tool_called',
        'tool_result',
      ]);
    },
    { timeout: 1000 },
  );
});

test('it catches up after the stream drops, with no gap and no repeat', async () => {
  const ctx = await setupTest();
  const hook = renderHook(() => useLiveRecords('conversation', 0));
  const one = await store.records.create({ kind: 'tool_called' });

  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(1);
  });

  // the browser comes back online, which ends the open connection, and the next attempt fails
  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }));
  globalThis.dispatchEvent(new Event('online'));

  const two = await store.records.create({ kind: 'tool_result' });

  // the client pauses before it follows again after a failed attempt
  await waitFor(
    () => {
      expect(hook.result.current.records.map((record) => record.sequence)).toStrictEqual([
        one.sequence,
        two.sequence,
      ]);
    },
    { timeout: 3000 },
  );
  expect(ctx.follows).toHaveBeenLastCalledWith({
    json: { afterSequence: one.sequence, thread: 'conversation' },
  });
});

test('it follows the log again at once when the page becomes visible', async () => {
  const ctx = await setupTest();
  const stalled = mock();

  // the first connection opens and then delivers nothing, as one that died unseen does
  server.use(
    http.post(
      '*/rpc/records/follow',
      () => {
        stalled();

        return new HttpResponse(new ReadableStream(), {
          headers: { 'content-type': 'text/event-stream' },
        });
      },
      { once: true },
    ),
  );

  const hook = renderHook(() => useLiveRecords('conversation', 0));

  await waitFor(() => {
    expect(stalled).toHaveBeenCalledOnce();
  });
  await store.records.create({ kind: 'tool_called' });
  globalThis.document.dispatchEvent(new Event('visibilitychange'));

  await waitFor(
    () => {
      expect(hook.result.current.records.map((record) => record.kind)).toStrictEqual([
        'tool_called',
      ]);
    },
    { timeout: 500 },
  );
  expect(ctx.follows).toHaveBeenCalledOnce();
});

test('it waits twice as long after each failed attempt in a row', async () => {
  const ctx = await setupTest();

  // every attempt fails, as one behind a content blocker does
  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error()));
  renderHook(() => useLiveRecords('conversation', 0, { startTimer: ctx.timer.startTimer }));

  const first = await ctx.timer.advanceToNext();
  const second = await ctx.timer.advanceToNext();
  const third = await ctx.timer.advanceToNext();

  expect(first).toBe(1000);
  expect(second).toBe(2000);
  expect(third).toBe(4000);
});

test('it waits the shortest time again after a failure that follows a connection', async () => {
  const ctx = await setupTest();

  await store.records.create({ kind: 'tool_called' });

  // the first attempt fails and the second connects
  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }));

  const hook = renderHook(() =>
    useLiveRecords('conversation', 0, { startTimer: ctx.timer.startTimer }),
  );

  await ctx.timer.advanceToNext();
  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(1);
  });

  // the browser comes back online, which ends the connection, and the next attempt fails
  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }));
  globalThis.dispatchEvent(new Event('online'));

  expect(ctx.timer.advanceToNext()).resolves.toBe(1000);
});

test('it backs off from a stream the API refuses, as from one that never opens', async () => {
  const ctx = await setupTest();

  // the session is revoked, so each stream opens and then refuses
  await store.sessions.update(ctx.session, {
    data(draft) {
      draft.revokedAt = new Date();
    },
  });
  renderHook(() => useLiveRecords('conversation', 0, { startTimer: ctx.timer.startTimer }));

  const first = await ctx.timer.advanceToNext();
  const second = await ctx.timer.advanceToNext();

  expect(first).toBe(1000);
  expect(second).toBe(2000);
});

test('it keeps live updates available after two failed attempts in a row', async () => {
  const ctx = await setupTest();

  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error()));

  const hook = renderHook(() =>
    useLiveRecords('conversation', 0, { startTimer: ctx.timer.startTimer }),
  );

  await ctx.timer.advanceToNext();

  // the second failure starts the second pause
  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(1);
  });

  // lets React render whatever the second failure set before the test reads it
  await act(() => Promise.resolve());

  expect(hook.result.current.unavailable).toBeFalse();
});

test('it reports live updates unavailable after three failed attempts in a row', async () => {
  const ctx = await setupTest();

  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error()));

  const hook = renderHook(() =>
    useLiveRecords('conversation', 0, { startTimer: ctx.timer.startTimer }),
  );

  await ctx.timer.advanceToNext();
  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(hook.result.current.unavailable).toBeTrue();
  });
});

test('it clears the unavailable report once the stream connects again', async () => {
  const ctx = await setupTest();

  // three attempts fail and the fourth connects
  server.use(
    http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }),
    http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }),
    http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }),
  );

  const hook = renderHook(() =>
    useLiveRecords('conversation', 0, { startTimer: ctx.timer.startTimer }),
  );

  await ctx.timer.advanceToNext();
  await ctx.timer.advanceToNext();
  await waitFor(() => {
    expect(hook.result.current.unavailable).toBeTrue();
  });
  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(hook.result.current.unavailable).toBeFalse();
  });
});
