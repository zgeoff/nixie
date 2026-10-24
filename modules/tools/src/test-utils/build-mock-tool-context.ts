import { faker } from '@faker-js/faker';
import type { ToolContext, ToolRun } from '../types';

export interface MockToolContextOverrides {
  readonly run?: Partial<ToolRun>;
}

export function buildMockToolContext(overrides: MockToolContextOverrides = {}): ToolContext {
  return {
    run: {
      runID: faker.string.uuid(),
      thread: 'conversation',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
      ...overrides.run,
    },
  };
}
