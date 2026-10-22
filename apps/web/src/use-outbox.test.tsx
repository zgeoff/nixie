import { expect, mock, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { readOutboxImages } from './read-outbox-images';
import { buildStubTimer } from './test-utils/build-stub-timer';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { setupBrowserTimeZone } from './test-utils/setup-browser-time-zone';
import { useOutbox } from './use-outbox';

function setupTest() {
  const sent = mock<(body: unknown) => void>();

  server.use(
    http.post('*/rpc/conversation/send', async (info) => {
      const body: unknown = await info.request.clone().json();

      sent(body);
    }),
  );

  let forgotten: readonly string[] = [];
  let resetSequence: number | undefined;
  const clock = { now: Date.parse('2026-10-17T09:00:00.000Z') };
  const timer = buildStubTimer();
  const options = { now: () => clock.now, startTimer: timer.startTimer };
  const rendered = renderHook(() => useOutbox(forgotten, { ...options, resetSequence }));

  return {
    clock,
    sent,
    rendered,
    timer,
    setForgotten: (clientMessageIDs: readonly string[]) => {
      forgotten = clientMessageIDs;
    },
    setResetSequence: (sequence: number) => {
      resetSequence = sequence;
    },
  };
}

test("it sends a message with the browser's time zone", async () => {
  const ctx = setupTest();

  await createDeviceSession();

  setupBrowserTimeZone('America/Sao_Paulo');

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '6f0c2a8e-3b1d-4c5e-9a7f-2d4b6c8e0a1f',
      spans: [{ end: 11, source: 'typed', start: 0 }],
      text: 'Just landed',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  expect(ctx.sent).toHaveBeenCalledExactlyOnceWith({
    json: {
      clientMessageId: '6f0c2a8e-3b1d-4c5e-9a7f-2d4b6c8e0a1f',
      spans: [{ end: 11, source: 'typed', start: 0 }],
      text: 'Just landed',
      thread: 'conversation',
      timeZone: 'America/Sao_Paulo',
      writtenAt: '2026-10-17T09:00:00.000Z',
    },
  });
});

test('it keeps the time zone a message was written in when its retry sends', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  setupBrowserTimeZone('America/Sao_Paulo');

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '6f0c2a8e-3b1d-4c5e-9a7f-2d4b6c8e0a1f',
      spans: [{ end: 11, source: 'typed', start: 0 }],
      text: 'Just landed',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  process.env.TZ = 'Europe/Lisbon';

  const [entry] = ctx.rendered.result.current.entries;

  invariant(entry, 'the outbox holds no message');

  await act(async () => {
    await ctx.rendered.result.current.retry(entry.message);
  });

  expect(ctx.sent.mock.calls.at(-1)?.[0]).toMatchObject({
    json: { timeZone: 'America/Sao_Paulo' },
  });
});

test('it drops a forgotten message from memory and device storage', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '8c4e2b7a-1d9f-4a3e-b6c5-0e7d3f1a9b28',
      spans: [{ end: 17, source: 'typed', start: 0 }],
      text: 'Call the plumber.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  const stored = globalThis.localStorage.getItem('nixie.outbox');

  act(() => {
    ctx.setForgotten(['8c4e2b7a-1d9f-4a3e-b6c5-0e7d3f1a9b28']);
    ctx.rendered.rerender();
  });

  expect(stored).toInclude('8c4e2b7a-1d9f-4a3e-b6c5-0e7d3f1a9b28');
  expect(ctx.rendered.result.current.entries).toStrictEqual([]);
  expect(globalThis.localStorage.getItem('nixie.outbox')).toBeNull();
});

test('it drops every message it holds when a reset arrives from memory and device storage', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '3a7d9e1c-5b2f-4c8a-9e6d-1f4b7c2a8d50',
      spans: [{ end: 15, source: 'typed', start: 0 }],
      text: 'Water the figs.',
      thread: 'conversation',
    });

    ctx.rendered.result.current.add({
      clientMessageId: '9b1e4f7a-2c6d-4e3b-8a5f-0d7c3e9b1a62',
      spans: [{ end: 13, source: 'typed', start: 0 }],
      text: 'Feed the cat.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries.map((entry) => entry.status)).toStrictEqual([
      'failed',
      'sent',
    ]);
  });

  const stored = globalThis.localStorage.getItem('nixie.outbox');
  const retries = ctx.timer.countPending();

  const reset = await store.records.create({ kind: 'log_reset' });

  act(() => {
    ctx.setResetSequence(reset.sequence);
    ctx.rendered.rerender();
  });

  expect(stored).toInclude('3a7d9e1c-5b2f-4c8a-9e6d-1f4b7c2a8d50');
  expect(retries).toBe(1);
  expect(ctx.rendered.result.current.entries).toStrictEqual([]);
  expect(globalThis.localStorage.getItem('nixie.outbox')).toBeNull();
  expect(ctx.timer.countPending()).toBe(0);
});

test('it keeps a message the API wrote after a reset that arrives late', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const reset = await store.records.create({ kind: 'log_reset' });

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '5e2a8c1f-7d4b-4f9a-b3e6-2c0d8f5a1b73',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Bring the chairs.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('sent');
  });

  act(() => {
    ctx.setResetSequence(reset.sequence);
    ctx.rendered.rerender();
  });

  expect(
    ctx.rendered.result.current.entries.map((entry) => entry.message.clientMessageId),
  ).toStrictEqual(['5e2a8c1f-7d4b-4f9a-b3e6-2c0d8f5a1b73']);
});

test('it keeps a message written after a reset arrives while the clock runs behind the server', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  const reset = await store.records.create({
    kind: 'log_reset',
    recordedAt: new Date('2026-10-17T09:01:00.000Z'),
  });

  act(() => {
    ctx.setResetSequence(reset.sequence);
    ctx.rendered.rerender();
  });

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '7c3f1a9e-4b2d-4e8c-a6f5-1d9b3e7c2a84',
      spans: [{ end: 18, source: 'typed', start: 0 }],
      text: 'Lock the back door.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  await ctx.timer.advanceToNext();

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('sent');
  });

  expect(
    ctx.rendered.result.current.entries.map((entry) => entry.message.clientMessageId),
  ).toStrictEqual(['7c3f1a9e-4b2d-4e8c-a6f5-1d9b3e7c2a84']);
});

test('it keeps a forgotten message out of device storage when a failed retry lands in the same render', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error()));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '4b1f8e6a-2c7d-4d9e-8a3b-6f0e2c5d9a71',
      spans: [{ end: 13, source: 'typed', start: 0 }],
      text: 'Feed the cat.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  const [entry] = ctx.rendered.result.current.entries;

  invariant(entry, 'the outbox holds no message');

  ctx.setForgotten(['4b1f8e6a-2c7d-4d9e-8a3b-6f0e2c5d9a71']);

  await act(() => ctx.rendered.result.current.retry(entry.message));

  expect(ctx.rendered.result.current.entries).toStrictEqual([]);
  expect(globalThis.localStorage.getItem('nixie.outbox')).toBeNull();
});

test('it keeps a message that another tab left unsent', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        spans: [{ end: 10, source: 'typed', start: 0 }],
        text: 'other tab',
        thread: 'conversation',
      },
    ]),
  );

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '2a6f9d3b-7c1e-4b8a-9d5f-3e0c6a2b8f17',
      spans: [{ end: 5, source: 'typed', start: 0 }],
      text: 'hello',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  expect(globalThis.localStorage.getItem('nixie.outbox')).toInclude(
    '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
  );
});

test('it retries a send the API did not answer after growing pauses, and sends it once the API answers', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  setupBrowserTimeZone('Asia/Tokyo');

  server.use(
    ...Array.from({ length: 3 }, () =>
      http.post('*/rpc/conversation/send', () => Response.error(), { once: true }),
    ),
  );

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
    });
  });

  const pauses = [
    await ctx.timer.advanceToNext(),
    await ctx.timer.advanceToNext(),
    await ctx.timer.advanceToNext(),
  ];

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('sent');
  });

  expect(pauses).toStrictEqual([2000, 4000, 8000]);
  expect(store.records.count()).toBe(1);

  expect(ctx.sent).toHaveBeenCalledExactlyOnceWith({
    json: {
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
      timeZone: 'Asia/Tokyo',
      writtenAt: '2026-10-17T09:00:00.000Z',
    },
  });
});

test('it shows when a failed send tries again on its own', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  expect(ctx.rendered.result.current.entries[0]).toMatchObject({
    failures: 1,
    retryAt: Date.parse('2026-10-17T09:00:02.000Z'),
  });
});

test('it retries a waiting send at once when the browser comes back online', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(1);
  });

  act(() => {
    globalThis.dispatchEvent(new Event('online'));
  });

  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  expect(ctx.timer.countPending()).toBe(0);
});

test('it retries a waiting send at once when the page becomes visible', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(1);
  });

  act(() => {
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
  });

  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  expect(ctx.timer.countPending()).toBe(0);
});

test('it leaves a send the API refused for you to retry', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(
    http.post('*/rpc/conversation/send', () =>
      HttpResponse.json(
        {
          json: {
            code: 'THREAD_NOT_FOUND',
            defined: true,
            message: 'No thread has this ID',
            status: 404,
          },
        },
        { status: 404 },
      ),
    ),
  );

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  expect(ctx.rendered.result.current.entries[0]?.retryAt).toBeUndefined();
  expect(ctx.timer.countPending()).toBe(0);
});

test('it holds a message that passed 2 minutes old while its send waited, instead of retrying it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(1);
  });

  ctx.clock.now = Date.parse('2026-10-17T09:05:00.000Z');

  await act(() => ctx.timer.advanceToNext());

  expect(ctx.rendered.result.current.entries[0]?.status).toBe('held');
  expect(store.records.count()).toBe(0);
});

test('it keeps retrying on its own a held message you chose to send', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(
    ...Array.from({ length: 2 }, () =>
      http.post('*/rpc/conversation/send', () => Response.error(), { once: true }),
    ),
  );

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(1);
  });

  ctx.clock.now = Date.parse('2026-10-17T09:05:00.000Z');

  await act(() => ctx.timer.advanceToNext());

  const [held] = ctx.rendered.result.current.entries;

  invariant(held, 'the outbox holds no message');

  await act(() => ctx.rendered.result.current.retry(held.message));
  await act(() => ctx.timer.advanceToNext());

  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });
});

test('it discards a held message from memory, device storage and its kept images', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      images: [new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' })],
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
    });
  });

  await waitFor(async () => {
    const kept = await readOutboxImages('9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13');

    expect(kept).toHaveLength(1);
  });

  ctx.clock.now = Date.parse('2026-10-17T09:05:00.000Z');

  await act(() => ctx.timer.advanceToNext());

  expect(ctx.rendered.result.current.entries[0]?.status).toBe('held');

  act(() => {
    ctx.rendered.result.current.discard('9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13');
  });

  expect(ctx.rendered.result.current.entries).toStrictEqual([]);
  expect(globalThis.localStorage.getItem('nixie.outbox')).toBeNull();

  await waitFor(async () => {
    const kept = await readOutboxImages('9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13');

    expect(kept).toStrictEqual([]);
  });

  expect(store.records.count()).toBe(0);
});

test('it starts no retry for a send that fails after the page leaves the conversation', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error(), { once: true }));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '9a3c5e7b-1d2f-4b6a-8c0e-2f4a6b8d0c13',
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Water the ferns.',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.timer.countPending()).toBe(1);
  });

  const [entry] = ctx.rendered.result.current.entries;

  invariant(entry, 'the outbox holds no message');

  const left = Promise.withResolvers<undefined>();

  server.use(
    http.post(
      '*/rpc/conversation/send',
      async () => {
        await left.promise;

        return Response.error();
      },
      { once: true },
    ),
  );

  const sending = ctx.rendered.result.current.retry(entry.message);

  ctx.rendered.unmount();
  left.resolve(undefined);

  await sending;

  expect(ctx.timer.countPending()).toBe(0);
  expect(store.records.count()).toBe(0);
});
