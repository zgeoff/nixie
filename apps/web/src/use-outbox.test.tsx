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

  return { sent, rendered: renderHook(() => useOutbox()) };
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
