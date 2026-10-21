import { faker } from '@faker-js/faker';
import type { WriteCaller } from '../gate-types';

export function buildMockWriteCaller(overrides: Partial<WriteCaller> = {}): WriteCaller {
  return {
    origin: 'conversation',
    thread: 'conversation',
    taskID: 'conversation',
    runID: 'conversation',
    model: `claude-${faker.lorem.word()}-${String(faker.number.int({ min: 1, max: 9 }))}`,
    ...overrides,
  };
}
