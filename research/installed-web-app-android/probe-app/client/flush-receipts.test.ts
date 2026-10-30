import { expect, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { flushReceipts } from './flush-receipts.ts';
import { openProbeStore } from './open-probe-store.ts';
import { createTestPhone } from '../src/test-utils/create-test-phone.ts';
import { createTestProbe } from '../src/test-utils/create-test-probe.ts';

test('it drops a receipt the server refuses for good, such as one from before a restart', async () => {
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe,probe.endpoint);
  const store = openProbeStore(new IDBFactory());

  await store.addReceipt({ pushID: '3e8a6c10-5b2d-4f7e-9a1c-6d8e0f2a4b33', receivedAt: 4_000 });

  const result = await flushReceipts(phone.client, store);

  expect(result).toStrictEqual({ sent: 0, dropped: 1, kept: 0 });
  expect(await store.listReceipts()).toStrictEqual([]);
});

test('it reports a stored receipt once the probe answers again', async () => {
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe,probe.endpoint);
  const store = openProbeStore(new IDBFactory());

  await phone.client.push({});

  const push = await phone.readPush(probe.pushBodies[0] ?? new Uint8Array());

  await store.addReceipt({ pushID: push.pushID, receivedAt: push.sentAt + 60_000 });

  const result = await flushReceipts(phone.client, store);

  expect(result).toStrictEqual({ sent: 1, dropped: 0, kept: 0 });
  expect((await phone.client.log()).filter((entry) => entry.kind === 'push-received')).toMatchObject(
    [{ detail: { phoneClockDelayMs: 60_000 } }],
  );
});
