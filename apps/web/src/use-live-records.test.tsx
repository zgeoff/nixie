import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useLiveRecords } from './use-live-records';

async function setupTest() {
  // the API streams the log only to a signed-in browser
  await createDeviceSession();

  // records each follow request's input, and lets the mock API answer it
  const follows = mock<(body: unknown) => void>();

  server.use(
    http.post('*/rpc/log/follow', async (info) => {
      const body: unknown = await info.request.clone().json();

      follows(body);
    }),
  );

  return { follows };
}

test('it delivers a tool call and its result within a second of the API recording them', async () => {
  await setupTest();

  const hook = renderHook(() => useLiveRecords('conversation', 0));

  await store.records.create({ kind: 'tool_called' });
  await store.records.create({ kind: 'tool_result' });

  await waitFor(
    () => {
      expect(hook.result.current.map((record) => record.kind)).toStrictEqual([
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
    expect(hook.result.current).toHaveLength(1);
  });

  // the browser comes back online, which ends the open connection, and the next attempt fails
  server.use(http.post('*/rpc/log/follow', () => HttpResponse.error(), { once: true }));
  globalThis.dispatchEvent(new Event('online'));

  const two = await store.records.create({ kind: 'tool_result' });

  // the client pauses before it follows again after a failed attempt
  await waitFor(
    () => {
      expect(hook.result.current.map((record) => record.sequence)).toStrictEqual([
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
      '*/rpc/log/follow',
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
      expect(hook.result.current.map((record) => record.kind)).toStrictEqual(['tool_called']);
    },
    { timeout: 500 },
  );
  expect(ctx.follows).toHaveBeenCalledOnce();
});
