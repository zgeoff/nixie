import { buildMockTaskStartBounds } from '@heynixie/tasks/test-utils';
import { makeCheckTaskStart } from '../task/make-check-task-start';
import type { TaskSeedContext } from '../task/types';

const conversationTools = ['tasks.list', 'task.message', 'task.report', 'time.now', 'task.define'];

// The context a seed of task definitions takes, on the real check of a start. The conversation holds
// task.define, which a file definition may not list, and the file starter also holds files.write,
// which the conversation lacks.
export function buildTestTaskSeed(): TaskSeedContext {
  const toolNames = [
    ...conversationTools,
    'files.write',
    'memory.recall',
    'memory.remember',
    'web.fetch',
  ];

  return {
    toolNames,
    checkTaskStart: makeCheckTaskStart({
      bounds: buildMockTaskStartBounds({ conversationTools: ['task.define'] }),
      toolNames,
      conversationTools,
    }),
  };
}
