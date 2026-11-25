import type { MailArrival, MailArrivalEvent } from '../types';

// An arrival of the library's sign-in code, over the fields that a test sets.
export function buildTestMailEvent(
  overrides: Partial<Omit<MailArrivalEvent, 'payload'>> & { payload?: Partial<MailArrival> } = {},
): MailArrivalEvent {
  const { payload, ...event } = overrides;

  return {
    kind: 'mail',
    mailbox: { kind: 'mail' },
    dedupeKey: 'host-1',
    occurredAt: '2027-03-09T00:00:00.000Z',
    ...event,
    payload: {
      messageID: 'mz4k8q2w7p',
      threadID: 'th6p2k9w4x',
      receivedAt: Date.parse('2027-03-09T00:00:00Z'),
      from: 'hello@library.example.org',
      subject: 'Your sign-in code',
      ...payload,
    },
  };
}
