import { expect, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { readOutboxImages } from './read-outbox-images';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useOutbox } from './use-outbox';
import { writeOutboxImages } from './write-outbox-images';

async function setupTest() {
  // every send needs a signed-in browser
  await createDeviceSession();

  // the stored outbox runs inside the outbox, which is how the page uses it
  const rendered = renderHook(() => useOutbox([]));

  return { rendered };
}

test('it keeps the images of an unsent message across a reload, and sends them with it', async () => {
  const ctx = await setupTest();

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

  // the page goes away with the message unsent, and the network is back for the next page
  ctx.rendered.unmount();
  server.resetHandlers();

  const reloaded = renderHook(() => useOutbox([]));

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
  // the message's images were never written to IndexedDB, or this browser lost them
  globalThis.localStorage.setItem(
    'nixie.outbox',
    JSON.stringify([
      {
        clientMessageId: '7e3a9c1d-5b2f-4e8a-a6d4-1c9f3b7e5a20',
        imageCount: 2,
        spans: [{ end: 16, source: 'typed', start: 0 }],
        text: 'Two hallway rugs',
        thread: 'conversation',
      },
    ]),
  );

  const ctx = await setupTest();

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
      },
    ]),
  );

  const ctx = await setupTest();

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
      },
    ]),
  );

  const ctx = await setupTest();

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
  const ctx = await setupTest();

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
    },
  ]);
});

test('it removes the kept images once the server confirms the message', async () => {
  const ctx = await setupTest();

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
