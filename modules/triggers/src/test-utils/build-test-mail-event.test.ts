import { expect, test } from 'bun:test';
import { buildTestMailEvent } from './build-test-mail-event';

test('it applies the overrides over a mail arrival and its payload', () => {
  const event = buildTestMailEvent({ dedupeKey: 'host-9', payload: { subject: 'Your new code' } });

  expect(event).toStrictEqual({
    kind: 'mail',
    mailbox: { kind: 'mail' },
    dedupeKey: 'host-9',
    occurredAt: '2027-03-09T00:00:00.000Z',
    payload: {
      messageID: 'mz4k8q2w7p',
      threadID: 'th6p2k9w4x',
      receivedAt: Date.parse('2027-03-09T00:00:00Z'),
      from: 'hello@library.example.org',
      subject: 'Your new code',
    },
  });
});
