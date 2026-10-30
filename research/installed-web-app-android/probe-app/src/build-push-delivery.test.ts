import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { buildPushDelivery } from './build-push-delivery.ts';

test('it sends nothing to a subscription whose session is gone', () => {
  expect(
    buildPushDelivery({
      recipient: undefined,
      sessionToken: 'cookie-value-of-a-signed-out-phone',
      push: {
        title: 'nixie probe',
        urgency: 'normal',
        tag: '',
        silent: false,
        renotify: false,
        approve: true,
        delaySeconds: 60,
      },
      pushID: '0c4e7a2b-8d1f-4b6a-9e3c-5f7a9b1d3e55',
      sentAt: 1_000,
      approvalID: '7a1d3f5b-2c4e-4a6b-8d0f-1e3a5c7e9b66',
      approvalToken: 'approval-token',
    }),
  ).toStrictEqual({ kind: 'skip' });
});

test('it sends a payload with no approval for a push without Approve', () => {
  expect(
    buildPushDelivery({
      recipient: { label: 'S-1a2b3c4d' },
      sessionToken: 'cookie-value-of-the-phone',
      push: {
        title: 'water the plants',
        urgency: 'high',
        tag: 'doze',
        silent: true,
        renotify: true,
        approve: false,
        delaySeconds: 0,
      },
      pushID: '0c4e7a2b-8d1f-4b6a-9e3c-5f7a9b1d3e55',
      sentAt: 1_000,
      approvalID: '7a1d3f5b-2c4e-4a6b-8d0f-1e3a5c7e9b66',
      approvalToken: 'approval-token',
    }),
  ).toStrictEqual({
    kind: 'send',
    recipient: { label: 'S-1a2b3c4d' },
    payload: {
      pushID: '0c4e7a2b-8d1f-4b6a-9e3c-5f7a9b1d3e55',
      sentAt: 1_000,
      title: 'water the plants',
      tag: 'doze',
      silent: true,
      renotify: true,
      urgency: 'high',
      approval: null,
    },
    approval: null,
  });
});

test('it puts the approval token in the payload and keeps only its hash', () => {
  expect(
    buildPushDelivery({
      recipient: { label: 'S-1a2b3c4d' },
      sessionToken: 'cookie-value-of-the-phone',
      push: {
        title: 'Approve a test item?',
        urgency: 'high',
        tag: 'approval',
        silent: false,
        renotify: false,
        approve: true,
        delaySeconds: 0,
      },
      pushID: '0c4e7a2b-8d1f-4b6a-9e3c-5f7a9b1d3e55',
      sentAt: 1_000,
      approvalID: '7a1d3f5b-2c4e-4a6b-8d0f-1e3a5c7e9b66',
      approvalToken: 'approval-token',
    }),
  ).toStrictEqual({
    kind: 'send',
    recipient: { label: 'S-1a2b3c4d' },
    payload: {
      pushID: '0c4e7a2b-8d1f-4b6a-9e3c-5f7a9b1d3e55',
      sentAt: 1_000,
      title: 'Approve a test item?',
      tag: 'approval',
      silent: false,
      renotify: false,
      urgency: 'high',
      approval: { approvalID: '7a1d3f5b-2c4e-4a6b-8d0f-1e3a5c7e9b66', token: 'approval-token' },
    },
    approval: {
      approvalID: '7a1d3f5b-2c4e-4a6b-8d0f-1e3a5c7e9b66',
      stored: {
        tokenHash: createHash('sha256').update('approval-token').digest(),
        sessionToken: 'cookie-value-of-the-phone',
        issuedAt: 1_000,
        used: false,
      },
    },
  });
});
