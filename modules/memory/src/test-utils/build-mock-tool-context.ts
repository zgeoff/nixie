import { faker } from '@faker-js/faker';
import type { MemoryWriteVerdict, ToolContext, ToolRun } from '@heynixie/tools';

export function buildMockToolContext(
  overrides: Partial<ToolRun> = {},
  verdict?: MemoryWriteVerdict,
): ToolContext {
  return {
    run: {
      runID: faker.string.uuid(),
      thread: 'conversation',
      logThread: overrides.thread ?? 'conversation',
      tools: [],
      model: {
        model: `claude-${faker.lorem.word()}-${String(faker.number.int({ min: 1, max: 9 }))}`,
        profile: 'standard',
      },
      ...overrides,
    },
    ...(verdict === undefined ? {} : { verdict }),
  };
}
