import { faker } from '@faker-js/faker';
import type { StepInput } from '@heynixie/tasks';

export function buildMockStepInput(overrides: Partial<StepInput> = {}): StepInput {
  return {
    taskID: 'conversation',
    stepKey: 'conversation:1',
    lease: {
      kind: 'task',
      workID: 'conversation',
      holder: faker.string.uuid(),
      generation: 1,
      epoch: faker.number.int({ min: 1, max: 1000 }),
      expiresAt: faker.number.int({ min: 1_000_000, max: 2_000_000 }),
    },
    inbox: [],
    wake: { hop: 0, cause: { kind: 'owner' } },
    sessionBoundary: null,
    signal: new AbortController().signal,
    interrupt: new AbortController().signal,
    ...overrides,
  };
}
