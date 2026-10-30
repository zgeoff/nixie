import { expect, mock, test } from 'bun:test';
import { buildProbeClient } from './build-probe-client.ts';
import { approveFromNotification } from './approve-from-notification.ts';
import { createTestPhone } from '../src/test-utils/create-test-phone.ts';
import { createTestProbe } from '../src/test-utils/create-test-probe.ts';

test('it approves with the session cookie and shows the answer in place of the push', async () => {
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe.answerRequest, probe.endpoint);
  const showNotification = mock(async (_title: string, _options: NotificationOptions) => {});

  await phone.client.push({ approve: true, tag: 'approval' });

  const push = await phone.readPush(probe.pushBodies[0] ?? new Uint8Array());

  if (push.approval === null) {
    throw new Error('the push carried no approval');
  }

  const outcome = await approveFromNotification(
    push.approval,
    'approval',
    phone.client,
    showNotification,
  );

  expect(outcome).toBe('Approved');
  expect(showNotification.mock.calls).toStrictEqual([
    [
      'Approved',
      {
        body: 'The probe server logged the call. Open block 2 to read it.',
        icon: '/icons/launcher-192.png',
        badge: '/icons/badge-96.png',
        tag: 'approval',
        data: { approval: null, page: '/block-2.html' },
      },
    ],
  ]);
  expect((await phone.client.log()).filter((entry) => entry.kind === 'approve')).toMatchObject([
    { detail: { outcome: 'approved', cookieSent: true, sessionKnown: true } },
  ]);
});

test('it shows the refusal when the worker has no session', async () => {
  const probe = await createTestProbe();
  const phone = await createTestPhone(probe.answerRequest, probe.endpoint);
  const signedOut = buildProbeClient({ origin: 'http://probe.test', fetch: probe.answerRequest });
  const showNotification = mock(async (_title: string, _options: NotificationOptions) => {});

  await phone.client.push({ approve: true });

  const push = await phone.readPush(probe.pushBodies[0] ?? new Uint8Array());

  if (push.approval === null) {
    throw new Error('the push carried no approval');
  }

  const outcome = await approveFromNotification(push.approval, '', signedOut, showNotification);

  expect(outcome).toBe('Refused (401): no session');
  expect(showNotification.mock.calls[0]?.[1]).toMatchObject({ tag: 'approve-result' });
});

test('it shows a failure when the probe cannot be reached', async () => {
  const unreachable = buildProbeClient({ origin: 'http://127.0.0.1:1' });
  const showNotification = mock(async (_title: string, _options: NotificationOptions) => {});

  const outcome = await approveFromNotification(
    { approvalID: '0b5b1f7e-3c2a-4d8e-9f10-1a2b3c4d5e6f', token: 'token' },
    'approval',
    unreachable,
    showNotification,
  );

  expect(outcome).toStartWith('Approve failed:');
});
