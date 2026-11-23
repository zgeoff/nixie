import { faker } from '@faker-js/faker';
import type { WriteCaller } from '../gate/gate-context';

type MockWriteCallerFields = Partial<Omit<WriteCaller, 'origin' | 'hasSelfNoteGrant'>>;

export type MockWriteCallerOverrides =
  | (MockWriteCallerFields & { readonly origin?: 'conversation' })
  | (MockWriteCallerFields & { readonly origin: 'task'; readonly hasSelfNoteGrant?: boolean });

export function buildMockWriteCaller(overrides: MockWriteCallerOverrides = {}): WriteCaller {
  const thread = overrides.thread ?? 'conversation';

  const fields = {
    thread,
    logThread: thread,
    taskID: 'conversation',
    runID: 'conversation',
    model: `claude-${faker.lorem.word()}-${String(faker.number.int({ min: 1, max: 9 }))}`,
    ...overrides,
  };

  return overrides.origin === 'task'
    ? { ...fields, origin: 'task', hasSelfNoteGrant: overrides.hasSelfNoteGrant ?? false }
    : { ...fields, origin: 'conversation' };
}
