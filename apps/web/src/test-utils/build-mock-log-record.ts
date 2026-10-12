import { faker } from '@faker-js/faker';
import type { LiveRecord } from '../use-live-records';

// A record of the log as the API sends it. The kind defaults to a bookkeeping record that carries
// no message, task or tool call; a test sets the kind and the fields its case needs.
export function buildMockLogRecord(overrides: Partial<LiveRecord> = {}): LiveRecord {
  return {
    kind: 'model.turn_ended',
    recordedAt: faker.date.recent(),
    sequence: faker.number.int({ max: 1_000_000, min: 1 }),
    thread: faker.lorem.slug(),
    ...overrides,
  };
}
