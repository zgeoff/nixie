import { expect, mock, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { server } from './mocks/node';
import { store } from './mocks/store';
import { createDeviceSession } from './test-utils/create-device-session';
import { renderHook } from './test-utils/render-hook';
import { useConversationRecords } from './use-conversation-records';

async function setupTest() {
  // the API reads and streams the conversation only for a signed-in browser
  await createDeviceSession();
}

test('it shows each record of the page and the live stream once, in order', async () => {
  await setupTest();

  const one = await store.records.create({ kind: 'owner_message' });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  const two = await store.records.create({ kind: 'assistant_message' });

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.sequence)).toStrictEqual([
      one.sequence,
      two.sequence,
    ]);
  });
});

test('it reports the conversation failed when the first read fails', async () => {
  await setupTest();

  server.use(http.post('*/rpc/conversation/read', () => new HttpResponse(null, { status: 503 })));

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('failed');
  });
});

test('it drops the records from before a reset once the reset arrives', async () => {
  await setupTest();

  await store.records.create({ kind: 'owner_message' });

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.records).toHaveLength(1);
  });

  // the reset removes the log, and the restarting server answers no read, so the page stays cached
  server.use(http.post('*/rpc/conversation/read', () => new HttpResponse(null, { status: 503 })));
  store.records.clear();

  const reset = await store.records.create({ kind: 'log_reset' });
  const next = await store.records.create({ kind: 'assistant_message' });

  await waitFor(() => {
    expect(hook.result.current.records.map((record) => record.sequence)).toStrictEqual([
      reset.sequence,
      next.sequence,
    ]);
  });
});

test('it reads the conversation again when a reset arrives', async () => {
  await setupTest();

  const reads = mock();

  server.use(
    http.post('*/rpc/conversation/read', () => {
      reads();
    }),
  );

  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  await store.records.create({ kind: 'log_reset' });

  await waitFor(() => {
    expect(reads).toHaveBeenCalledTimes(2);
  });
});

test('it reads the conversation again once the live stream reconnects after a reset', async () => {
  await setupTest();

  const failed = mock();
  const reads = mock();
  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  // the first read after the reset reaches the server while it restarts
  server.use(
    http.post(
      '*/rpc/conversation/read',
      () => {
        failed();

        return new HttpResponse(null, { status: 503 });
      },
      { once: true },
    ),
    http.post('*/rpc/conversation/read', () => {
      reads();
    }),
  );

  await store.records.create({ kind: 'log_reset' });

  await waitFor(() => {
    expect(failed).toHaveBeenCalledOnce();
  });

  // the browser comes back online, which ends the open connection, and the stream connects again
  globalThis.dispatchEvent(new Event('online'));

  await waitFor(() => {
    expect(reads).toHaveBeenCalledOnce();
  });
});

test('it keeps the conversation ready when the read after a reset fails', async () => {
  await setupTest();

  const failed = mock();
  const hook = renderHook(() => useConversationRecords('conversation'));

  await waitFor(() => {
    expect(hook.result.current.status).toBe('ready');
  });

  server.use(
    http.post('*/rpc/conversation/read', () => {
      failed();

      return new HttpResponse(null, { status: 503 });
    }),
  );

  await store.records.create({ kind: 'log_reset' });

  await waitFor(() => {
    expect(failed).toHaveBeenCalledOnce();
  });

  const next = await store.records.create({ kind: 'assistant_message' });

  await waitFor(() => {
    expect(hook.result.current.records.at(-1)?.sequence).toBe(next.sequence);
  });

  expect(hook.result.current.status).toBe('ready');
});
