import type { TaskStartBounds } from '../types';

export function buildMockTaskStartBounds(
  overrides: Partial<TaskStartBounds> = {},
): TaskStartBounds {
  return {
    models: [],
    limits: { default: { turns: 25, dollars: 2 }, max: { turns: 100, dollars: 10 } },
    memoryTools: {
      read: ['memory.recall', 'moment.read'],
      write: ['memory.remember', 'moment.keep'],
    },
    conversationTools: ['skill_read'],
    ...overrides,
  };
}
