import { expect, mock, test } from 'bun:test';
import { act, waitFor } from '@testing-library/react';
import { http } from 'msw';
import invariant from 'tiny-invariant';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { setupBrowserTimeZone } from './test-utils/setup-browser-time-zone';
import { useOutbox } from './use-outbox';

async function setupTest() {
  // every send needs a signed-in browser
  await createDeviceSession();

  const sent = mock<(body: unknown) => void>();

  // the recorder answers nothing, so each request goes on to the mock API
  server.use(
    http.post('*/rpc/conversation/send', async (info) => {
      const body: unknown = await info.request.clone().json();

      sent(body);
    }),
  );

  // the conversation names the messages a forget dropped, and a test names them through forget
  let forgotten: readonly string[] = [];
  const rendered = renderHook(() => useOutbox(forgotten));

  return {
    sent,
    rendered,
    forget: (clientMessageIDs: readonly string[]) => {
      forgotten = clientMessageIDs;

      rendered.rerender();
    },
  };
}

test("it sends a message with the browser's time zone", async () => {
  const ctx = await setupTest();

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
    },
  });
});

test('it keeps the time zone a message was written in when its retry sends', async () => {
  const ctx = await setupTest();

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

  // the browser moves on before the retry; the setup above restores the run's zone at the end
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
  const ctx = await setupTest();

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
    ctx.forget(['8c4e2b7a-1d9f-4a3e-b6c5-0e7d3f1a9b28']);
  });

  expect(stored).toInclude('8c4e2b7a-1d9f-4a3e-b6c5-0e7d3f1a9b28');
  expect(ctx.rendered.result.current.entries).toStrictEqual([]);
  expect(globalThis.localStorage.getItem('nixie.outbox')).toBeNull();
});

test('it keeps a message that another tab left unsent', async () => {
  const ctx = await setupTest();

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
