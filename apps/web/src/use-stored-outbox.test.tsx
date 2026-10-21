import { expect, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { http } from 'msw';
import invariant from 'tiny-invariant';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { readOutboxImages } from './read-outbox-images';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useOutbox } from './use-outbox';
import { writeOutboxImages } from './write-outbox-images';

function setupTest() {
  const options = { now: () => Date.parse('2026-10-17T09:00:30.000Z') };
  const rendered = renderHook(() => useOutbox([], options));

  return { options, rendered };
}

test('it keeps the images of an unsent message across a reload, and sends them with it', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error()));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
      images: [
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'image.png', { type: 'image/png' }),
        new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'image.jpg', { type: 'image/jpeg' }),
      ],
      spans: [{ end: 16, source: 'typed', start: 0 }],
      text: 'Two hallway rugs',
      thread: 'conversation',
    });
  });

  await waitFor(async () => {
    const kept = await readOutboxImages('7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20');

    expect(kept).toHaveLength(2);
  });

  ctx.rendered.unmount();
  server.resetHandlers();

  const reloaded = renderHook(() => useOutbox([], ctx.options));

  await waitFor(() => {
    expect(reloaded.result.current.entries[0]?.status).toBe('sent');
  });

  expect(
    store.records.findFirst((query) => query.where({ kind: 'owner_message' }))?.message,
  ).toMatchObject({
    clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
    images: [
      { data: 'iVBORw==', mediaType: 'image/png' },
      { data: '/9j/4A==', mediaType: 'image/jpeg' },
    ],
    text: 'Two hallway rugs',
  });

  expect(reloaded.result.current.entries[0]?.message.images).toHaveLength(2);
});

test('it keeps a stored message unsent when its images do not read back after a reload', async () => {
  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
        imageCount: 2,
        spans: [{ end: 16, source: 'typed', start: 0 }],
        text: 'Two hallway rugs',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
    ]),
  );

  const ctx = setupTest();

  await createDeviceSession();

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  expect(store.records.count()).toBe(0);

  expect(JSON.parse(globalThis.localStorage.getItem('nixie.outbox') ?? 'null')).toMatchObject([
    { clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20', imageCount: 2 },
  ]);
});

test('it sends a stored message with its images on a retry once they read back', async () => {
  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
        imageCount: 1,
        spans: [{ end: 9, source: 'typed', start: 0 }],
        text: 'A doormat',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
    ]),
  );

  const ctx = setupTest();

  await createDeviceSession();

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  const [failed] = ctx.rendered.result.current.entries;

  if (failed === undefined) {
    throw new Error('the outbox holds no entry');
  }

  await writeOutboxImages('7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20', [
    new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' }),
  ]);

  await act(() => ctx.rendered.result.current.retry(failed.message));

  expect(
    store.records.findFirst((query) => query.where({ kind: 'owner_message' }))?.message,
  ).toMatchObject({ images: [{ data: 'iVA=', mediaType: 'image/png' }], text: 'A doormat' });
});

test('it sends a stored message with images before one you send while its images load', async () => {
  await writeOutboxImages('7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20', [
    new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' }),
  ]);

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
        imageCount: 1,
        spans: [{ end: 9, source: 'typed', start: 0 }],
        text: 'A doormat',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
    ]),
  );

  const ctx = setupTest();

  await createDeviceSession();

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '2d6f8a1c-3e5b-4c7d-9f0a-b1c2d3e4f5a6',
      spans: [{ end: 11, source: 'typed', start: 0 }],
      text: 'And a mat?',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries.map((entry) => entry.status)).toStrictEqual([
      'sent',
      'sent',
    ]);
  });

  expect(
    store.records
      .findMany((query) => query.where({ kind: 'owner_message' }))
      .map((record) => record.message?.text),
  ).toStrictEqual(['A doormat', 'And a mat?']);
});

test('it keeps the images out of localStorage, which holds only the text and their count', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error()));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
      images: [new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' })],
      spans: [{ end: 9, source: 'typed', start: 0 }],
      text: 'A doormat',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  const stored: unknown = JSON.parse(globalThis.localStorage.getItem('nixie.outbox') ?? 'null');

  expect(stored).toStrictEqual([
    {
      clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
      imageCount: 1,
      spans: [{ end: 9, source: 'typed', start: 0 }],
      text: 'A doormat',
      thread: 'conversation',
      timeZone: expect.toBeString(),
      writtenAt: '2026-10-17T09:00:30.000Z',
    },
  ]);
});

test('it removes the kept images once the server confirms the message', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
      images: [new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' })],
      spans: [{ end: 9, source: 'typed', start: 0 }],
      text: 'A doormat',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('sent');
  });

  await waitFor(async () => {
    const kept = await readOutboxImages('7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20');

    expect(kept).toStrictEqual([]);
  });
});

test('it keeps when you wrote an unsent message across a reload', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  server.use(http.post('*/rpc/conversation/send', () => Response.error()));

  act(() => {
    ctx.rendered.result.current.add({
      clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
      spans: [{ end: 9, source: 'typed', start: 0 }],
      text: 'A doormat',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries[0]?.status).toBe('failed');
  });

  ctx.rendered.unmount();

  const reloaded = renderHook(() => useOutbox([], ctx.options));

  await waitFor(() => {
    expect(reloaded.result.current.entries[0]?.message.writtenAt).toBe('2026-10-17T09:00:30.000Z');
  });
});

test('it loads a stored message with no written time, and holds it as stale', async () => {
  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
        spans: [{ end: 9, source: 'typed', start: 0 }],
        text: 'A doormat',
        thread: 'conversation',
        timeZone: 'Europe/Lisbon',
      },
    ]),
  );

  const ctx = setupTest();

  await createDeviceSession();

  await waitFor(() => {
    expect(ctx.rendered.result.current.entries).toStrictEqual([
      {
        message: {
          clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
          spans: [{ end: 9, source: 'typed', start: 0 }],
          text: 'A doormat',
          thread: 'conversation',
          timeZone: 'Europe/Lisbon',
        },
        status: 'held',
      },
    ]);
  });

  expect(store.records.count()).toBe(0);
});

test('it keeps a message that another tab discarded out of storage and out of this tab', async () => {
  await createDeviceSession();

  const options = { now: () => Date.parse('2026-10-17T09:10:00.000Z') };

  await writeOutboxImages('7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20', [
    new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' }),
  ]);

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
        imageCount: 1,
        spans: [{ end: 9, source: 'typed', start: 0 }],
        text: 'A doormat',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
    ]),
  );

  const first = renderHook(() => useOutbox([], options));
  const second = renderHook(() => useOutbox([], options));

  await waitFor(() => {
    expect(second.result.current.entries[0]?.status).toBe('held');
  });

  act(() => {
    first.result.current.discard('7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20');
  });

  act(() => {
    second.result.current.add({
      clientMessageId: '2d6f8a1c-3e5b-4c7d-9f0a-b1c2d3e4f5a6',
      spans: [{ end: 11, source: 'typed', start: 0 }],
      text: 'And a mat?',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  expect(globalThis.localStorage.getItem('nixie.outbox') ?? '').not.toInclude(
    '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
  );

  act(() => {
    globalThis.dispatchEvent(new StorageEvent('storage', { key: 'nixie.outbox.discarded' }));
  });

  expect(second.result.current.entries.map((entry) => entry.message.clientMessageId)).toStrictEqual(
    ['2d6f8a1c-3e5b-4c7d-9f0a-b1c2d3e4f5a6'],
  );
});

test('it holds a fresh stored message that passed 2 minutes old while an earlier send stalled', async () => {
  await createDeviceSession();

  const clock = { now: Date.parse('2026-10-17T09:00:30.000Z') };
  const options = { now: () => clock.now };
  const stalled = Promise.withResolvers<undefined>();

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        spans: [{ end: 5, source: 'typed', start: 0 }],
        text: 'first',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
      {
        clientMessageId: '0b9d6c1e-2f4a-4e7b-9c3d-8a5f1e2b7c64',
        spans: [{ end: 6, source: 'typed', start: 0 }],
        text: 'second',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
    ]),
  );

  server.use(
    http.post(
      '*/rpc/conversation/send',
      async () => {
        await stalled.promise;
      },
      { once: true },
    ),
  );

  const rendered = renderHook(() => useOutbox([], options));

  await waitFor(() => {
    expect(rendered.result.current.entries.map((entry) => entry.status)).toStrictEqual([
      'sending',
      'sending',
    ]);
  });

  clock.now = Date.parse('2026-10-17T09:05:00.000Z');

  stalled.resolve(undefined);

  await waitFor(() => {
    expect(rendered.result.current.entries.map((entry) => entry.status)).toStrictEqual([
      'sent',
      'held',
    ]);
  });

  expect(
    store.records
      .findMany((query) => query.where({ kind: 'owner_message' }))
      .map((record) => record.message?.text),
  ).toStrictEqual(['first']);
});

test('it never sends a message that another tab discarded while its send waited in the queue', async () => {
  await createDeviceSession();

  const options = { now: () => Date.parse('2026-10-17T09:10:00.000Z') };
  const stalled = Promise.withResolvers<undefined>();

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
        spans: [{ end: 9, source: 'typed', start: 0 }],
        text: 'A doormat',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
    ]),
  );

  const first = renderHook(() => useOutbox([], options));
  const second = renderHook(() => useOutbox([], options));

  await waitFor(() => {
    expect(first.result.current.entries[0]?.status).toBe('held');
  });

  server.use(
    http.post(
      '*/rpc/conversation/send',
      async () => {
        await stalled.promise;
      },
      { once: true },
    ),
  );

  act(() => {
    first.result.current.add({
      clientMessageId: '2d6f8a1c-3e5b-4c7d-9f0a-b1c2d3e4f5a6',
      spans: [{ end: 11, source: 'typed', start: 0 }],
      text: 'And a mat?',
      thread: 'conversation',
    });
  });

  const [held] = first.result.current.entries;

  invariant(held, 'the first tab holds no message');

  let sending: Promise<void> = Promise.resolve();

  act(() => {
    sending = first.result.current.retry(held.message);
  });

  act(() => {
    second.result.current.discard('7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20');
  });

  stalled.resolve(undefined);

  await act(() => sending);

  expect(
    store.records
      .findMany((query) => query.where({ kind: 'owner_message' }))
      .map((record) => record.message?.text),
  ).toStrictEqual(['And a mat?']);
});

test('it keeps a discarded message out of storage when a tab that slept for days writes again', async () => {
  await createDeviceSession();

  const clock = { now: Date.parse('2026-10-17T09:10:00.000Z') };
  const options = { now: () => clock.now };

  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
        spans: [{ end: 9, source: 'typed', start: 0 }],
        text: 'A doormat',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
    ]),
  );

  const first = renderHook(() => useOutbox([], options));
  const second = renderHook(() => useOutbox([], options));

  await waitFor(() => {
    expect(second.result.current.entries[0]?.status).toBe('held');
  });

  act(() => {
    first.result.current.discard('7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20');
  });

  clock.now = Date.parse('2026-10-20T09:10:00.000Z');

  act(() => {
    second.result.current.add({
      clientMessageId: '2d6f8a1c-3e5b-4c7d-9f0a-b1c2d3e4f5a6',
      spans: [{ end: 11, source: 'typed', start: 0 }],
      text: 'And a mat?',
      thread: 'conversation',
    });
  });

  await waitFor(() => {
    expect(store.records.count()).toBe(1);
  });

  expect(globalThis.localStorage.getItem('nixie.outbox') ?? '').not.toInclude(
    '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
  );
});
