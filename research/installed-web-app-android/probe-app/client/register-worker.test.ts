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
  const scope = {
    indexedDB: factory,
    registration: { showNotification: mock(async () => {}) },
    clients: {
      claim: mock(async () => {}),
      matchAll: mock(async () => []),
      openWindow: mock(async () => null),
    },
    skipWaiting: mock(async () => {}),
    addEventListener: listeners,
  };

  return { factory, listeners, scope };
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
  const phone = await createTestPhone(probe.answerRequest, probe.endpoint);
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
