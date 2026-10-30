import { expect, test } from 'bun:test';
import { pickNotificationClick } from './pick-notification-click.ts';

test('it approves on the Approve button of a push with an approval', () => {
  expect(
    pickNotificationClick('approve', {
      approval: { approvalID: '0b5b1f7e-3c2a-4d8e-9f10-1a2b3c4d5e6f', token: 'token' },
      page: '/block-2.html',
    }),
  ).toStrictEqual({
    kind: 'approve',
    approval: { approvalID: '0b5b1f7e-3c2a-4d8e-9f10-1a2b3c4d5e6f', token: 'token' },
  });
});

test.each<[string, string, unknown, '/block-1.html' | '/block-2.html']>([
  [
    'the Open button',
    'open',
    {
      approval: { approvalID: '0b5b1f7e-3c2a-4d8e-9f10-1a2b3c4d5e6f', token: 'token' },
      page: '/block-2.html',
    },
    '/block-2.html',
  ],
  ['the Approve result notification', '', { approval: null, page: '/block-2.html' }, '/block-2.html'],
  ['a plain push', '', { approval: null, page: '/block-1.html' }, '/block-1.html'],
  ['a notification with no data', '', null, '/block-1.html'],
  ['a notification with a page it never opens', '', { page: '/send.html' }, '/block-1.html'],
])('it opens a page on a tap on %s', (_label, action, data, page) => {
  expect(pickNotificationClick(action, data)).toStrictEqual({ kind: 'open', page });
});
