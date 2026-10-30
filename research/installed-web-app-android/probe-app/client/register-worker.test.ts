import { expect, mock, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { createTestPhone } from '../src/test-utils/create-test-phone.ts';
import { createTestProbe } from '../src/test-utils/create-test-probe.ts';
import { buildProbeClient } from './build-probe-client.ts';
import { openProbeStore } from './open-probe-store.ts';
import { registerWorker, type WorkerEvent } from './register-worker.ts';

function setupTest() {
  const factory = new IDBFactory();
  const listeners = mock((_type: string, _listener: (event: WorkerEvent) => void) => {});
  const registerSync = mock(async (_tag: string) => {});
  const scope = {
    indexedDB: factory,
    registration: { showNotification: mock(async () => {}), sync: { register: registerSync } },
    clients: {
      claim: mock(async () => {}),
      matchAll: mock(async () => []),
      openWindow: mock(async () => null),
    },
    skipWaiting: mock(async () => {}),
    addEventListener: listeners,
  };

  return { factory, listeners, registerSync, scope };
}

test('it rejects the sync of the outbox while a message stays queued', async () => {
  const ctx = setupTest();
  const waitUntil = mock((_promise: Promise<unknown>) => {});

  await openProbeStore(ctx.factory).addMessage({
    id: '9d3f1b64-2e7a-4c5d-8b9e-0f1a2b3c4d22',
    text: 'water the plants',
    queuedAt: 2_000,
  });
  registerWorker(ctx.scope, buildProbeClient({ origin: 'http://127.0.0.1:1' }));
  const syncEvent = { waitUntil, tag: 'probe-outbox', lastChance: false };

  ctx.listeners.mock.calls.find(([type]) => type === 'sync')?.[1](syncEvent);

  expect(waitUntil.mock.calls[0]?.[0]).rejects.toThrow('1 messages wait for the next sync');
});

test('it resolves the sync of the outbox once every message is sent', async () => {
  const ctx = setupTest();
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe, probe.endpoint);
  const waitUntil = mock((_promise: Promise<unknown>) => {});

  await openProbeStore(ctx.factory).addMessage({
    id: '9d3f1b64-2e7a-4c5d-8b9e-0f1a2b3c4d22',
    text: 'water the plants',
    queuedAt: 2_000,
  });
  registerWorker(ctx.scope, phone.client);
  const syncEvent = { waitUntil, tag: 'probe-outbox', lastChance: true };

  ctx.listeners.mock.calls.find(([type]) => type === 'sync')?.[1](syncEvent);

  await waitUntil.mock.calls[0]?.[0];

  expect(await openProbeStore(ctx.factory).listMessages()).toStrictEqual([]);
  expect((await phone.client.log()).filter((entry) => entry.kind === 'sync')).toMatchObject([
    { detail: { text: 'water the plants', lastChance: true } },
  ]);
});

test('it registers the receipt sync when a push receipt cannot be reported', async () => {
  const ctx = setupTest();
  const waitUntil = mock((_promise: Promise<unknown>) => {});
  const pushEvent = {
    waitUntil,
    data: {
      json: () => ({
        pushID: '5b7e2c90-1d4a-4f3e-8c6b-9a0d1e2f3a44',
        sentAt: 1_000,
        title: 'nixie probe',
        tag: '',
        silent: false,
        renotify: false,
        urgency: 'normal',
        approval: null,
      }),
    },
  };

  registerWorker(ctx.scope, buildProbeClient({ origin: 'http://127.0.0.1:1' }));
  ctx.listeners.mock.calls.find(([type]) => type === 'push')?.[1](pushEvent);

  await waitUntil.mock.calls[0]?.[0];

  expect(ctx.registerSync.mock.calls).toStrictEqual([['probe-receipts']]);
  expect(await openProbeStore(ctx.factory).listReceipts()).toMatchObject([
    { pushID: '5b7e2c90-1d4a-4f3e-8c6b-9a0d1e2f3a44' },
  ]);
});

test('it rejects the sync of receipts while a report still fails', async () => {
  const ctx = setupTest();
  const waitUntil = mock((_promise: Promise<unknown>) => {});

  await openProbeStore(ctx.factory).addReceipt({
    pushID: '5b7e2c90-1d4a-4f3e-8c6b-9a0d1e2f3a44',
    receivedAt: 4_000,
  });
  registerWorker(ctx.scope, buildProbeClient({ origin: 'http://127.0.0.1:1' }));
  const syncEvent = { waitUntil, tag: 'probe-receipts', lastChance: false };

  ctx.listeners.mock.calls.find(([type]) => type === 'sync')?.[1](syncEvent);

  expect(waitUntil.mock.calls[0]?.[0]).rejects.toThrow('1 receipts wait for the next sync');
});

test('it reports a kept receipt on the sync of receipts once the probe answers', async () => {
  const ctx = setupTest();
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe, probe.endpoint);
  const waitUntil = mock((_promise: Promise<unknown>) => {});
  const sent = await phone.client.push({});

  await openProbeStore(ctx.factory).addReceipt({ pushID: sent.pushID, receivedAt: Date.now() });
  registerWorker(ctx.scope, phone.client);
  const syncEvent = { waitUntil, tag: 'probe-receipts', lastChance: false };

  ctx.listeners.mock.calls.find(([type]) => type === 'sync')?.[1](syncEvent);

  await waitUntil.mock.calls[0]?.[0];

  expect(await openProbeStore(ctx.factory).listReceipts()).toStrictEqual([]);
  expect((await phone.client.log()).filter((entry) => entry.kind === 'push-received')).toMatchObject(
    [{ detail: { pushID: sent.pushID } }],
  );
});
