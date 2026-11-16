import type { TriggerEvent } from '../types';

// A schedule event of the daily tomato watering, over the fields that a test sets.
export function buildTestTriggerEvent(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    kind: 'schedule',
    dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    scheduledFor: '2027-03-09T21:00:00.000Z',
    occurredAt: '2027-03-09T21:00:00.000Z',
    missed: [],
    missedCount: 0,
    payload: null,
    ...overrides,
  };
}
