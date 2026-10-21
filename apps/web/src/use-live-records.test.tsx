import { expect, mock, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { HttpResponse, delay, http } from 'msw';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { buildStubTimer } from './test-utils/build-stub-timer';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useLiveRecords } from './use-live-records';

async function setupTest() {
  const session = await createDeviceSession();

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

test('it drops the records it delivered before a reset once the reset arrives', async () => {
  await setupTest();

  const hook = renderHook(() => useLiveRecords('conversation', 0));

  await store.records.create({ kind: 'tool_called' });

  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(1);
  });

  await store.records.create({ kind: 'log_reset' });
  await store.records.create({ kind: 'tool_result' });

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.kind)).toStrictEqual([
      'log_reset',
      'tool_result',
    ]);
  });
});

test('it catches up after the stream drops, with no gap and no repeat', async () => {
  const ctx = await setupTest();

  const hook = renderHook(() => useLiveRecords('conversation', 0));

  const one = await store.records.create({ kind: 'tool_called' });

  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(1);
  });

  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }));
  globalThis.dispatchEvent(new Event('online'));

  const two = await store.records.create({ kind: 'tool_result' });

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

test('it keeps reporting live updates unavailable while the API refuses a revoked session', async () => {
  const ctx = await setupTest();

  const reported: boolean[] = [];

  await store.sessions.update(ctx.session, {
    data(draft) {
      draft.revokedAt = new Date();
    },
  });

  server.use(
    http.post('*/rpc/records/follow', async () => {
      await delay(20);
    }),
  );

  renderHook(() => {
    const live = useLiveRecords('conversation', 0, { startTimer: ctx.timer.startTimer });

    reported.push(live.unavailable);

    return live;
  });

  await ctx.timer.advanceToNext();
  await ctx.timer.advanceToNext();
  await ctx.timer.advanceToNext();
  await ctx.timer.advanceToNext();

  expect(reported.slice(reported.indexOf(true))).toSatisfyAll(
    (unavailable: boolean) => unavailable,
  );
});

test('it keeps live updates available after two failed attempts in a row', async () => {
  const ctx = await setupTest();

  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error()));

  const hook = renderHook(() =>
    useLiveRecords('conversation', 0, { startTimer: ctx.timer.startTimer }),
  );

  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(1);
  });

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
