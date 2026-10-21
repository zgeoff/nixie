import { faker } from '@faker-js/faker';
import type { LiveRecord } from '../use-live-records';

export function buildMockLogRecord(overrides: Partial<LiveRecord> = {}): LiveRecord {
  return {
    kind: 'model.turn_ended',
    recordedAt: faker.date.recent(),
    sequence: faker.number.int({ max: 1_000_000, min: 1 }),
    thread: faker.lorem.slug(),
    ...overrides,
  };
}
