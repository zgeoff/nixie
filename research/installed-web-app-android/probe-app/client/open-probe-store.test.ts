import { expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { openProbeStore } from './open-probe-store.ts';

test('it moves a refused message out of the outbox with its reason', async () => {
  const store = openProbeStore(new IDBFactory());

  await store.addMessage({ id: 'message-1', text: 'too long', queuedAt: 1_000 });
  await store.addMessage({ id: 'message-2', text: 'fine', queuedAt: 2_000 });
  await store.refuseMessage({
    id: 'message-1',
    text: 'too long',
    queuedAt: 1_000,
    status: 400,
    reason: 'Input validation failed',
  });

  expect(await store.listMessages()).toStrictEqual([
    { id: 'message-2', text: 'fine', queuedAt: 2_000 },
  ]);
  expect(await store.listRefused()).toStrictEqual([
    { id: 'message-1', text: 'too long', queuedAt: 1_000, status: 400, reason: 'Input validation failed' },
  ]);
});

test('it keeps receipts until each one is removed', async () => {
  const store = openProbeStore(new IDBFactory());

  await store.addReceipt({ pushID: 'push-1', receivedAt: 1_000 });
  await store.addReceipt({ pushID: 'push-2', receivedAt: 2_000 });
  await store.removeReceipt('push-1');

  expect(await store.listReceipts()).toStrictEqual([{ pushID: 'push-2', receivedAt: 2_000 }]);
});
