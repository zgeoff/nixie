import { expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { buildProbeClient } from './build-probe-client.ts';
import { drainOutbox } from './drain-outbox.ts';
import { openProbeStore } from './open-probe-store.ts';
import { createTestPhone } from '../src/test-utils/create-test-phone.ts';
import { createTestProbe } from '../src/test-utils/create-test-probe.ts';

test('it sets a refused message aside and sends the messages behind it', async () => {
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe,probe.endpoint);
  const store = openProbeStore(new IDBFactory());

  await store.addMessage({
    id: '1c0e7a52-6b8d-4f3e-a9c1-2d4b6f8a0c11',
    text: 'x'.repeat(2001),
    queuedAt: 1_000,
  });
  await store.addMessage({
    id: '9d3f1b64-2e7a-4c5d-8b9e-0f1a2b3c4d22',
    text: 'water the plants',
    queuedAt: 2_000,
  });

  const result = await drainOutbox(false, phone.client, store);

  expect(result).toStrictEqual({ sent: 1, refused: 1, kept: 0 });
  expect(await store.listMessages()).toStrictEqual([]);
  expect(await store.listRefused()).toMatchObject([
    { id: '1c0e7a52-6b8d-4f3e-a9c1-2d4b6f8a0c11', status: 400 },
  ]);
  expect((await phone.client.log()).filter((entry) => entry.kind === 'sync')).toMatchObject([
    { detail: { text: 'water the plants', lastChance: false } },
  ]);
});

test('it keeps every message for the next sync when the probe cannot be reached', async () => {
  const store = openProbeStore(new IDBFactory());

  await store.addMessage({
    id: '9d3f1b64-2e7a-4c5d-8b9e-0f1a2b3c4d22',
    text: 'water the plants',
    queuedAt: 2_000,
  });

  const result = await drainOutbox(
    true,
    buildProbeClient({ origin: 'http://127.0.0.1:1' }),
    store,
  );

  expect(result).toStrictEqual({ sent: 0, refused: 0, kept: 1 });
  expect(await store.listMessages()).toHaveLength(1);
  expect(await store.listRefused()).toStrictEqual([]);
});
