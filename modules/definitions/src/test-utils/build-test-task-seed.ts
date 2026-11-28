import { buildMockTaskStartBounds } from '@heynixie/tasks/test-utils';
import { makeCheckTaskStart } from '../task/make-check-task-start';
import type { TaskSeedContext } from '../task/types';

const conversationTools = ['tasks.list', 'task.message', 'task.report', 'time.now', 'task.define'];

// The context a seed of task definitions takes, on the real check of a start. The conversation holds
// task.define, which a file definition may not list, and the file starter also holds files.write.
// Each server ID adds the `<server>.*` entry of a configured MCP server.
export function buildTestTaskSeed(serverIDs: readonly string[] = []): TaskSeedContext {
  const toolNames = [
    ...conversationTools,
    'files.write',
    'memory.recall',
    'memory.remember',
    'memory.edit',
    'memory.retire',
    'moment.find',
    'moment.read',
    'moment.edit',
    'log.read',
    'web.fetch',
    ...serverIDs.map((serverID) => `${serverID}.*`),
  ];

  return {
    toolNames,
    checkTaskStart: makeCheckTaskStart({
      bounds: buildMockTaskStartBounds({
        models: [
          { name: 'second-look', profile: 'router-b', description: 'Another family', missing: [] },
        ],
        conversationTools: ['task.define'],
        memoryTools: {
          read: ['memory.recall', 'proposals.pending', 'moment.find', 'moment.read'],
          write: ['memory.remember', 'memory.edit', 'memory.retire', 'moment.keep', 'moment.edit'],
        },
      }),
      toolNames,
      conversationTools,
    }),
  };
}
