import { expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { openProbeStore } from './open-probe-store.ts';

test('it drops the 2 message stores of version 1 and keeps its stored receipts', async () => {
  const factory = new IDBFactory();
  const versionOne = Promise.withResolvers<IDBDatabase>();
  const opening = factory.open('probe', 1);

  opening.addEventListener('upgradeneeded', () => {
    opening.result
      .createObjectStore('receipts', { keyPath: 'pushID' })
      .put({ pushID: '2d6f8a1c-3e5b-4c7d-9f0a-1b2c3d4e5f77', receivedAt: 3_000 });
    opening.result.createObjectStore('outbox', { keyPath: 'id' });
    opening.result.createObjectStore('refused', { keyPath: 'id' });
  });
  opening.addEventListener('success', () => versionOne.resolve(opening.result));
  (await versionOne.promise).close();

  const store = openProbeStore(factory);
  const receipts = await store.listReceipts();
  const versionTwo = Promise.withResolvers<IDBDatabase>();
  const reopening = factory.open('probe');

  reopening.addEventListener('success', () => versionTwo.resolve(reopening.result));

  const database = await versionTwo.promise;

  expect(receipts).toStrictEqual([
    { pushID: '2d6f8a1c-3e5b-4c7d-9f0a-1b2c3d4e5f77', receivedAt: 3_000 },
  ]);
  expect([...database.objectStoreNames].toSorted()).toStrictEqual(['messages', 'receipts']);
});

test('it moves a refused message out of the outbox with its reason', async () => {
  const store = openProbeStore(new IDBFactory());

  await store.addMessage({ id: 'message-1', text: 'too long', queuedAt: 1_000 });
  await store.addMessage({ id: 'message-2', text: 'fine', queuedAt: 2_000 });
  await store.refuseMessage('message-1', 400, 'Input validation failed');

  expect(await store.listMessages()).toStrictEqual([
    { id: 'message-2', text: 'fine', queuedAt: 2_000 },
  ]);
  expect(await store.listRefused()).toStrictEqual([
    {
      id: 'message-1',
      text: 'too long',
      queuedAt: 1_000,
      status: 400,
      reason: 'Input validation failed',
    },
  ]);
});

test('it takes a sent message out of the outbox', async () => {
  const store = openProbeStore(new IDBFactory());

  await store.addMessage({ id: 'message-1', text: 'sent soon', queuedAt: 1_000 });
  await store.markSent('message-1');

  expect(await store.listMessages()).toStrictEqual([]);
  expect(await store.listRefused()).toStrictEqual([]);
});

test('it refuses to refuse a message the outbox never held', async () => {
  const store = openProbeStore(new IDBFactory());

  expect(store.refuseMessage('message-9', 400, 'refused')).rejects.toThrow(
    'message message-9 cannot move from absent to refused',
  );
});

test('it refuses to queue again the ID of a refused message', async () => {
  const store = openProbeStore(new IDBFactory());

  await store.addMessage({ id: 'message-1', text: 'too long', queuedAt: 1_000 });
  await store.refuseMessage('message-1', 400, 'refused');

  expect(store.addMessage({ id: 'message-1', text: 'again', queuedAt: 2_000 })).rejects.toThrow(
    'message message-1 cannot move from refused to queued',
  );
});

test('it refuses to queue again the ID of a sent message', async () => {
  const store = openProbeStore(new IDBFactory());

  await store.addMessage({ id: 'message-1', text: 'sent', queuedAt: 1_000 });
  await store.markSent('message-1');

  expect(store.addMessage({ id: 'message-1', text: 'again', queuedAt: 2_000 })).rejects.toThrow(
    'message message-1 cannot move from sent to queued',
  );
});

test('it keeps receipts until each one is removed', async () => {
  const store = openProbeStore(new IDBFactory());

  await store.addReceipt({ pushID: 'push-1', receivedAt: 1_000 });
  await store.addReceipt({ pushID: 'push-2', receivedAt: 2_000 });
  await store.removeReceipt('push-1');

  expect(await store.listReceipts()).toStrictEqual([{ pushID: 'push-2', receivedAt: 2_000 }]);
});
