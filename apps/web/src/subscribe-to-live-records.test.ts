import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { buildBrowserClient } from './build-browser-client';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { subscribeToLiveRecords } from './subscribe-to-live-records';
import { buildStubTimer } from './test-utils/build-stub-timer';
import { createDeviceSession } from './test-utils/create-device-session';

async function setupTest() {
  const session = await createDeviceSession();

  const follows = mock<(body: unknown) => void>();

  server.use(
    http.post('*/rpc/records/follow', async (info) => {
      const body: unknown = await info.request.clone().json();

      follows(body);
    }),
  );

  const following = new AbortController();

  onTestFinished(() => {
    following.abort();
  });

  return {
    client: buildBrowserClient(),
    follows,
    session,
    signal: following.signal,
    timer: buildStubTimer(),
  };
}

test('it waits twice as long after each failed attempt in a row', async () => {
  const ctx = await setupTest();

  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error()));

  void subscribeToLiveRecords({
    afterSequence: 0,
    client: ctx.client,
    onAvailability: mock<() => void>(),
    onRecord: mock<() => void>(),
    signal: ctx.signal,
    startTimer: ctx.timer.startTimer,
    thread: 'conversation',
  });

  const first = await ctx.timer.advanceToNext();
  const second = await ctx.timer.advanceToNext();
  const third = await ctx.timer.advanceToNext();

  expect(first).toBe(1000);
  expect(second).toBe(2000);
  expect(third).toBe(4000);
});

test('it waits the shortest time again after a failure that follows a connection', async () => {
  const ctx = await setupTest();

  const onRecord = mock<() => void>();

  await store.records.create({ kind: 'tool_called' });

  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }));

  void subscribeToLiveRecords({
    afterSequence: 0,
    client: ctx.client,
    onAvailability: mock<() => void>(),
    onRecord,
    signal: ctx.signal,
    startTimer: ctx.timer.startTimer,
    thread: 'conversation',
  });

  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(onRecord).toHaveBeenCalledOnce();
  });

  server.use(http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }));
  globalThis.dispatchEvent(new Event('online'));

  expect(ctx.timer.advanceToNext()).resolves.toBe(1000);
});

test('it backs off from a revoked session, as from a stream that never opens', async () => {
  const ctx = await setupTest();

  await store.sessions.update(ctx.session, {
    data(draft) {
      draft.revokedAt = new Date();
    },
  });

  void subscribeToLiveRecords({
    afterSequence: 0,
    client: ctx.client,
    onAvailability: mock<() => void>(),
    onRecord: mock<() => void>(),
    signal: ctx.signal,
    startTimer: ctx.timer.startTimer,
    thread: 'conversation',
  });

  const first = await ctx.timer.advanceToNext();
  const second = await ctx.timer.advanceToNext();

  expect(first).toBe(1000);
  expect(second).toBe(2000);
});

test('it backs off from a stream that opens and then ends with UNAUTHORIZED', async () => {
  const ctx = await setupTest();

  server.use(
    http.post(
      '*/rpc/records/follow',
      () =>
        new HttpResponse(
          ': \n\nevent: error\ndata: {"json":{"defined":true,"code":"UNAUTHORIZED","status":401,"message":"The device session is missing, lapsed or revoked"}}\n\n',
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    ),
  );

  void subscribeToLiveRecords({
    afterSequence: 0,
    client: ctx.client,
    onAvailability: mock<() => void>(),
    onRecord: mock<() => void>(),
    signal: ctx.signal,
    startTimer: ctx.timer.startTimer,
    thread: 'conversation',
  });

  const first = await ctx.timer.advanceToNext();
  const second = await ctx.timer.advanceToNext();

  expect(first).toBe(1000);
  expect(second).toBe(2000);
});

test('it follows the log again at once when the browser comes back online during the longest pause', async () => {
  const ctx = await setupTest();

  server.use(
    ...Array.from({ length: 6 }, () =>
      http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }),
    ),
  );

  void subscribeToLiveRecords({
    afterSequence: 0,
    client: ctx.client,
    onAvailability: mock<() => void>(),
    onRecord: mock<() => void>(),
    signal: ctx.signal,
    startTimer: ctx.timer.startTimer,
    thread: 'conversation',
  });

  for (let pauses = 0; pauses < 5; pauses += 1) {
    await ctx.timer.advanceToNext();
  }

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(1);
  });

  globalThis.dispatchEvent(new Event('online'));

  await waitFor(() => {
    expect(ctx.follows).toHaveBeenCalledOnce();
  });

  expect(ctx.timer.countPending()).toBe(0);
});

test('it follows the log again at once when the page becomes visible during the longest pause', async () => {
  const ctx = await setupTest();

  server.use(
    ...Array.from({ length: 6 }, () =>
      http.post('*/rpc/records/follow', () => HttpResponse.error(), { once: true }),
    ),
  );

  void subscribeToLiveRecords({
    afterSequence: 0,
    client: ctx.client,
    onAvailability: mock<() => void>(),
    onRecord: mock<() => void>(),
    signal: ctx.signal,
    startTimer: ctx.timer.startTimer,
    thread: 'conversation',
  });

  for (let pauses = 0; pauses < 5; pauses += 1) {
    await ctx.timer.advanceToNext();
  }

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(1);
  });

  globalThis.document.dispatchEvent(new Event('visibilitychange'));

  await waitFor(() => {
    expect(ctx.follows).toHaveBeenCalledOnce();
  });

  expect(ctx.timer.countPending()).toBe(0);
});
