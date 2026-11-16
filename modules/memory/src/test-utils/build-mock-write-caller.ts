import { faker } from '@faker-js/faker';
import type { WriteCaller } from '../gate/gate-context';

export function buildMockWriteCaller(overrides: Partial<WriteCaller> = {}): WriteCaller {
  const thread = overrides.thread ?? 'conversation';

  return {
    origin: 'conversation',
    thread,
    logThread: thread,
    taskID: 'conversation',
    runID: 'conversation',
    model: `claude-${faker.lorem.word()}-${String(faker.number.int({ min: 1, max: 9 }))}`,
    ...overrides,
  };
}
