import { faker } from '@faker-js/faker';
import type { ToolContext, ToolRun } from '../types';

export interface MockToolContextOverrides {
  readonly run?: Partial<ToolRun>;
  readonly callSequence?: number;
}

export function buildMockToolContext(overrides: MockToolContextOverrides = {}): ToolContext {
  return {
    run: {
      runID: faker.string.uuid(),
      thread: 'conversation',
      logThread: 'conversation',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
      ...overrides.run,
    },
    callSequence: overrides.callSequence ?? faker.number.int({ min: 1, max: 1_000_000 }),
  };
}
