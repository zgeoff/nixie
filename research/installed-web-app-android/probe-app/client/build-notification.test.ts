import { expect, test } from 'bun:test';
import { buildNotification } from './build-notification.ts';

test('it gives an approval push its buttons, its tag and renotify', () => {
  const notification = buildNotification({
    pushID: '3e8a6c10-5b2d-4f7e-9a1c-6d8e0f2a4b33',
    sentAt: Date.UTC(2026, 9, 30, 9, 0, 0),
    title: 'Approve a test item?',
    tag: 'approval',
    silent: false,
    renotify: true,
    urgency: 'high',
    approval: { approvalID: '0b5b1f7e-3c2a-4d8e-9f10-1a2b3c4d5e6f', token: 'token' },
  });

  expect(notification).toStrictEqual({
    title: 'Approve a test item?',
    options: {
      body: expect.stringMatching(/^Sent .+, urgency high\. Approve or open\.$/),
      icon: '/icons/launcher-192.png',
      badge: '/icons/badge-96.png',
      data: {
        pushID: '3e8a6c10-5b2d-4f7e-9a1c-6d8e0f2a4b33',
        approval: { approvalID: '0b5b1f7e-3c2a-4d8e-9f10-1a2b3c4d5e6f', token: 'token' },
      },
      silent: false,
      tag: 'approval',
      renotify: true,
      actions: [
        { action: 'approve', title: 'Approve' },
        { action: 'open', title: 'Open' },
      ],
    },
  });
});

test('it leaves out the tag and renotify of a push with no tag', () => {
  const notification = buildNotification({
    pushID: '3e8a6c10-5b2d-4f7e-9a1c-6d8e0f2a4b33',
    sentAt: Date.UTC(2026, 9, 30, 9, 0, 0),
    title: 'nixie probe',
    tag: '',
    silent: true,
    renotify: true,
    urgency: 'normal',
    approval: null,
  });

  expect(notification.options).not.toContainAnyKeys(['tag', 'renotify', 'actions']);
});
