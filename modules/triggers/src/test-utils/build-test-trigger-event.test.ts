import { expect, test } from 'bun:test';
import { buildTestTriggerEvent } from './build-test-trigger-event';

test('it applies the overrides over a schedule event', () => {
  const event = buildTestTriggerEvent({ dedupeKey: 'k-1', skip: 'too_late' });

  expect(event).toStrictEqual({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    kind: 'schedule',
    dedupeKey: 'k-1',
    scheduledFor: '2027-03-09T21:00:00.000Z',
    occurredAt: '2027-03-09T21:00:00.000Z',
    missed: [],
    missedCount: 0,
    skip: 'too_late',
    payload: null,
  });
});
