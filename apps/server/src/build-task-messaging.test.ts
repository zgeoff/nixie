import { expect, test } from 'bun:test';
import { memoryConsolidatorTaskID, memoryWriterTaskID } from '@heynixie/memory';
import { conversationTaskID } from '@heynixie/tasks';
import { buildTaskMessaging } from './build-task-messaging';

test('it lists the conversation and both memory tasks when both are on', () => {
  expect(
    buildTaskMessaging({
      memory_writer: { isEnabled: true },
      memory_consolidation: { isEnabled: true },
      owner: { name: 'Rowan' },
      agent: { names: ['Pip', 'Pippin'] },
      tasks: { messaging: { hopLimit: 7 } },
    }),
  ).toStrictEqual({
    directory: [
      {
        taskID: conversationTaskID,
        name: 'Conversation',
        brief: 'Talks with Rowan and answers each message.',
        isWokenByMessages: true,
        speaker: 'conversation',
      },
      {
        taskID: memoryWriterTaskID,
        name: 'Memory writer',
        brief:
          'Reads the conversation in batches and saves or proposes what Rowan says as memory. Runs on its own schedule.',
        isWokenByMessages: false,
        speaker: 'plain_task',
      },
      {
        taskID: memoryConsolidatorTaskID,
        name: 'Memory consolidator',
        brief:
          'Tidies memory on its own schedule, and proposes merges, rewrites and retirements for Rowan to review.',
        isWokenByMessages: false,
        speaker: 'plain_task',
      },
    ],
    hopLimit: 7,
    ownerName: 'Rowan',
    agentName: 'Pip',
  });
});

test('it leaves out a memory task that is off, and names an unnamed owner as the owner', () => {
  expect(
    buildTaskMessaging({
      memory_writer: { isEnabled: false },
      memory_consolidation: { isEnabled: false },
      owner: { name: null },
      agent: { names: [] },
      tasks: { messaging: { hopLimit: 20 } },
    }),
  ).toStrictEqual({
    directory: [
      {
        taskID: conversationTaskID,
        name: 'Conversation',
        brief: 'Talks with the owner and answers each message.',
        isWokenByMessages: true,
        speaker: 'conversation',
      },
    ],
    hopLimit: 20,
    ownerName: null,
    agentName: null,
  });
});
