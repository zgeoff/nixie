import { expect, mock, test } from 'bun:test';
import { IDBFactory } from 'fake-indexeddb';
import { buildProbeClient } from './build-probe-client.ts';
import { openProbeStore } from './open-probe-store.ts';
import { receivePush } from './receive-push.ts';
import { createTestPhone } from '../src/test-utils/create-test-phone.ts';
import { createTestProbe } from '../src/test-utils/create-test-probe.ts';

test('it shows the push and reports its receipt with the time the phone received it', async () => {
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe.answerRequest, probe.endpoint);
  const store = openProbeStore(new IDBFactory());
  const showNotification = mock(async (_title: string, _options: NotificationOptions) => {});

  await phone.client.push({ title: 'a test push' });

  const push = await phone.readPush(probe.pushBodies[0] ?? new Uint8Array());
  const result = await receivePush(push, push.sentAt + 2_500, phone.client, store, showNotification);

  expect(result).toStrictEqual({ sent: 1, dropped: 0, kept: 0 });
  expect(showNotification.mock.calls[0]?.[0]).toBe('a test push');
  expect(await store.listReceipts()).toStrictEqual([]);
  expect((await phone.client.log()).filter((entry) => entry.kind === 'push-received')).toMatchObject(
    [{ detail: { pushID: push.pushID, phoneClockDelayMs: 2_500 } }],
  );
});

test('it keeps the receipt with its time when the report fails', async () => {
  const store = openProbeStore(new IDBFactory());
  const showNotification = mock(async (_title: string, _options: NotificationOptions) => {});

  const result = await receivePush(
    {
      pushID: '3e8a6c10-5b2d-4f7e-9a1c-6d8e0f2a4b33',
      sentAt: 1_000,
      title: 'sent while the tunnel was down',
      tag: '',
      silent: false,
      renotify: false,
      urgency: 'normal',
      approval: null,
    },
    4_000,
    buildProbeClient({ origin: 'http://127.0.0.1:1' }),
    store,
    showNotification,
  );

  expect(result).toStrictEqual({ sent: 0, dropped: 0, kept: 1 });
  expect(showNotification).toHaveBeenCalledTimes(1);
  expect(await store.listReceipts()).toStrictEqual([
    { pushID: '3e8a6c10-5b2d-4f7e-9a1c-6d8e0f2a4b33', receivedAt: 4_000 },
  ]);
});
