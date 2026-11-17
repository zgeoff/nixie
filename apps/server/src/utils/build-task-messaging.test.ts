import { expect, test } from 'bun:test';
import { conversationTaskID } from '@heynixie/tasks';
import { buildTaskMessaging } from './build-task-messaging';

test('it lists the conversation with the owner and agent names', () => {
  expect(
    buildTaskMessaging({
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
        wakeable: true,
        speaker: 'conversation',
      },
    ],
    unlisted: [],
    hopLimit: 7,
    ownerName: 'Rowan',
    agentName: 'Pip',
  });
});

test('it names an unnamed owner as the owner', () => {
  expect(
    buildTaskMessaging({
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
        wakeable: true,
        speaker: 'conversation',
      },
    ],
    unlisted: [],
    hopLimit: 20,
    ownerName: null,
    agentName: null,
  });
});
