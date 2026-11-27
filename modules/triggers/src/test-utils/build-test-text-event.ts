import type { TextArrival, TextArrivalEvent } from '../types';

// An arrival of a sign-up code by text, over the fields that a test sets.
export function buildTestTextEvent(
  overrides: Partial<Omit<TextArrivalEvent, 'payload'>> & { payload?: Partial<TextArrival> } = {},
): TextArrivalEvent {
  const { payload, ...event } = overrides;

  return {
    kind: 'text',
    mailbox: { kind: 'source', sourceID: 'test-texts' },
    dedupeKey: 'provider-1',
    occurredAt: '2027-03-09T00:00:00.000Z',
    ...event,
    payload: {
      messageID: 'tx8k2m4q9w',
      receivedAt: Date.parse('2027-03-09T00:00:00Z'),
      from: 'Example',
      body: 'Your code is 5521',
      precisionMs: 1,
      ...payload,
    },
  };
}
